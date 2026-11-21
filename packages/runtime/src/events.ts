import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { eventTimelineLength, type ActivationTrackDef, type EventTimelineDef } from './schema';
import { ActivationContext, clipInside, clipValue, setEventOnly, setEventVisible, targetObject } from './activation';
import { useStageData } from './data';
import { defaultParams, registry } from './registry';
import { useStageEnv } from './context';
import type { SceneHandle } from './SceneContent';

// Event Timelines: each plays once per Key when its Trigger fires or it is called by name.
// When playback ends, visibility and Clip poses go back to what the data decides.

/** Where an Event came from: `data` for a Trigger, `call` for {@link EventStore.fire}. */
export type EventSource = 'data' | 'call';
/** Called when an Event Timeline starts playing. */
export type EventListener = (name: string, key: string, source: EventSource) => void;

/** An Event Timeline that is playing. */
export interface PlayingEvent {
  /** Id of the Event Timeline. */
  timelineId: string;
  /** Slot Key the Event plays for (`''` for Events without slots). */
  key: string;
  /** Seconds since it started. */
  t: number;
}

/** Queues Events and tracks the ones playing. Shared by the code that fires Events and {@link EventDirector}. */
export class EventStore {
  /** Events that are playing. Read by the playhead of the studio Timeline. */
  playing: PlayingEvent[] = [];
  /** Events to start on the next frame. `at` is when they were requested (performance.now). */
  queue: { name: string; key: string; source: EventSource; at: number }[] = [];
  private listeners = new Set<EventListener>();

  /**
   * Plays an Event by its name (the Timeline's name).
   * @param key The slot Key (such as the id of a list item). Omit it for Events without slots.
   */
  fire(name: string, key = '') {
    this.queue.push({ name, key, source: 'call', at: performance.now() });
  }

  /** Calls `f` when an Event Timeline starts playing. Returns a function that removes the listener. */
  onPlay(f: EventListener) {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  }

  /** Notifies the listeners that an Event Timeline started playing. */
  emitPlay(name: string, key: string, source: EventSource) {
    this.listeners.forEach((f) => f(name, key, source));
  }
}

/** Provides the {@link EventStore} of the current view. */
export const EventContext = createContext<EventStore>(new EventStore());

/**
 * Returns the targets that have Tracks only in Event Timelines. Targets with a Track on the Play Timeline (`tracks`) are left out,
 * and so are slot objects (`slot:`), which the data decides.
 */
export function eventOnlyTargets(timelines: EventTimelineDef[], tracks: ActivationTrackDef[]) {
  const main = new Set(tracks.map((t) => t.target));
  const out = new Set<string>();
  for (const tl of timelines) for (const tr of tl.tracks) if (!main.has(tr.target) && !tr.target.startsWith('slot:')) out.add(tr.target);
  return out;
}

/** Returns the {@link EventStore} of the current view. Call `fire` on it to play an Event directly. */
export function useEvents(): EventStore {
  return useContext(EventContext);
}

/**
 * Plays Event Timelines when Triggers fire or Events are called. Place it inside the Canvas.
 * `tracks` are the Activation Tracks of the Play Timeline (used to tell which targets have Tracks only in Events).
 */
export function EventDirector(props: { timelines: EventTimelineDef[]; tracks: ActivationTrackDef[]; handle: SceneHandle; paused?: boolean }) {
  const { timelines, tracks, handle, paused } = props;
  const events = useEvents();
  const data = useStageData();
  const activation = useContext(ActivationContext);
  const env = useStageEnv();
  const current = useRef(timelines);
  current.current = timelines;

  const st = useMemo(
    () => ({
      mixers: new Map<THREE.Object3D, THREE.AnimationMixer>(),
      used: new Set<THREE.AnimationMixer>(),
      // Actions run this frame and last frame.
      running: [new Set<THREE.AnimationAction>(), new Set<THREE.AnimationAction>()],
      shown: [new Set<THREE.Object3D>(), new Set<THREE.Object3D>()],
      flip: 0,
      values: new Map<string, number>(),
      warned: new Set<string>(),
    }),
    [],
  );
  const lengths = useMemo(() => new Map(timelines.map((t) => [t.id, eventTimelineLength(t)])), [timelines]);

  const eventOnly = useMemo(() => eventOnlyTargets(timelines, tracks), [timelines, tracks]);

  useEffect(() => {
    const marked: THREE.Object3D[] = [];
    const apply = () => {
      for (const o of marked) setEventOnly(o, false);
      marked.length = 0;
      for (const t of eventOnly) {
        const o = t.startsWith('ui:') ? undefined : targetObject(handle, t);
        if (!o) continue;
        setEventOnly(o, true);
        marked.push(o);
      }
    };
    apply();
    const off = handle.subscribe(apply);
    return () => {
      off();
      for (const o of marked) setEventOnly(o, false);
    };
  }, [eventOnly, handle]);

  const warnOnce = (text: string) => {
    if (st.warned.has(text)) return;
    st.warned.add(text);
    env.log('warn', text);
  };

  useEffect(() => {
    for (const tl of timelines) {
      if (tl.trigger.type !== 'none' && !registry.trigger(tl.trigger.type)) warnOnce(`${tl.name}: Trigger ${tl.trigger.type} is not registered`);
    }
  }, [timelines]);

  // Compare data before and after each receive. On the first receive, and when the time is moved in the studio, only reset the baseline without comparing.
  useEffect(() => {
    let base: unknown = data.value;
    return data.onSet((value, received, silent) => {
      if (silent) {
        base = value;
        return;
      }
      if (!received) return;
      const prev = base;
      base = value;
      if (prev == null || value == null) return;
      for (const tl of current.current) {
        const def = tl.trigger.type === 'none' ? undefined : registry.trigger(tl.trigger.type);
        if (!def) continue;
        try {
          const at = performance.now();
          for (const key of def.detect(prev, value, defaultParams(def, tl.trigger.params))) events.queue.push({ name: tl.name, key, source: 'data', at });
        } catch (e: any) {
          env.log('error', `${tl.name}: Trigger ${tl.trigger.type} failed: ${e?.message ?? e}`);
        }
      }
    });
  }, [data, events]);

  useEffect(
    () => () => {
      for (const s of st.running) for (const a of s) a.stop();
      for (const s of st.shown) for (const o of s) setEventVisible(o, false);
      for (const [o, m] of st.mixers) {
        m.stopAllAction();
        m.uncacheRoot(o);
      }
      st.mixers.clear();
      events.playing.length = 0;
      activation.writeEvents(new Map(), new Set());
    },
    [st, events, activation],
  );

  useFrame((_, dt) => {
    const tls = current.current;
    // Guard the splice: splicing an empty queue allocates an array every frame.
    // rAF stops while the page is hidden but data Events keep queueing, so requests older than the Timeline's length are dropped.
    if (events.queue.length) for (const q of events.queue.splice(0)) {
      const tl = tls.find((x) => x.name === q.name);
      if (!tl) {
        warnOnce(`Event ${q.name} has no Timeline`);
        continue;
      }
      if (performance.now() - q.at > (lengths.get(tl.id) ?? 0) * 1000) continue;
      const p = events.playing.find((x) => x.timelineId === tl.id && x.key === q.key);
      if (p) p.t = 0;
      else events.playing.push({ timelineId: tl.id, key: q.key, t: 0 });
      events.emitPlay(tl.name, q.key, q.source);
    }

    const values = st.values;
    values.clear();
    const shown = st.shown[1 - st.flip];
    const wasShown = st.shown[st.flip];
    shown.clear();
    const running = st.running[1 - st.flip];
    const wasRunning = st.running[st.flip];
    running.clear();
    st.used.clear();
    const step = paused ? 0 : Math.min(dt, 0.25);

    for (let i = events.playing.length - 1; i >= 0; i--) {
      const p = events.playing[i];
      const tl = tls.find((x) => x.id === p.timelineId);
      if (!tl || p.t >= (lengths.get(tl.id) ?? 0)) {
        events.playing.splice(i, 1);
        continue;
      }
      for (const tr of tl.tracks) {
        let v = 0;
        let any = false;
        for (const c of tr.clips) {
          if (!clipInside(c, p.t)) continue;
          any = true;
          v = Math.max(v, clipValue(c, p.t));
        }
        if (!any) continue;
        // 'slot:' points at a different object for each Key, so its value cannot be looked up by name.
        if (!tr.target.startsWith('slot:')) values.set(tr.target, Math.max(values.get(tr.target) ?? 0, v));
        // 3D objects don't fade: they are shown anywhere inside the span, even when the data hides them.
        if (!tr.target.startsWith('ui:')) {
          const o = targetObject(handle, tr.target, p.key);
          if (o) shown.add(o);
        }
      }
      for (const tr of tl.animations) {
        const o = targetObject(handle, tr.target, p.key);
        if (!o) continue;
        for (const c of tr.clips) {
          if (p.t < c.start || p.t >= c.end) continue;
          const clip = (o.userData.clips as THREE.AnimationClip[] | undefined)?.find((x) => x.name === c.clip);
          if (!clip) {
            warnOnce(`${tl.name}: ${o.name || tr.target} has no Clip ${c.clip}`);
            continue;
          }
          let m = st.mixers.get(o);
          if (!m) st.mixers.set(o, (m = new THREE.AnimationMixer(o)));
          const a = m.clipAction(clip);
          if (!a.isScheduled()) {
            a.setLoop(THREE.LoopOnce, 1);
            a.clampWhenFinished = true;
            a.play();
          }
          a.enabled = true;
          a.paused = false;
          a.time = Math.min(p.t - c.start, clip.duration);
          running.add(a);
          st.used.add(m);
        }
      }
      p.t += step;
    }

    // Stop actions that left their span. Stopping makes three.js restore the position and rotation from before the Clip moved them.
    for (const a of wasRunning) if (!running.has(a)) a.stop();
    for (const m of st.used) m.update(0);
    for (const o of shown) setEventVisible(o, true);
    for (const o of wasShown) if (!shown.has(o)) setEventVisible(o, false);
    st.flip = 1 - st.flip;
    activation.writeEvents(values, eventOnly);

    // Dispose the mixers of objects that are gone (the number of slots changed). Not while anything is playing.
    if (!events.playing.length && st.mixers.size) {
      for (const [o, m] of st.mixers) {
        if (o.parent) continue;
        m.stopAllAction();
        m.uncacheRoot(o);
        st.mixers.delete(o);
      }
    }
  }, -1);

  return null;
}
