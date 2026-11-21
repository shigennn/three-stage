import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ActivationClipDef, ActivationTrackDef, AnimationTrackDef, CameraDef } from './schema';
import { cameraTimeline } from './cameras';
import type { Playback } from './playback';
import type { SceneHandle } from './SceneContent';
import { useStageEnv } from './context';

// Activation Tracks. 2D UI parts fade; 3D objects are only shown or hidden, and code applies the fade value itself.

/** Whether `t` is inside the span. 3D visibility uses this, not the fade value, which is 0 on the first frame of a Fade In. */
export function clipInside(c: ActivationClipDef, t: number) {
  return t >= c.start && t < c.end;
}

/** Returns the value (0 to 1) of a span at time `t`, including its fades. 0 outside the span. */
export function clipValue(c: ActivationClipDef, t: number) {
  if (!clipInside(c, t)) return 0;
  let v = 1;
  if (c.fadeIn > 0) v = Math.min(v, (t - c.start) / c.fadeIn);
  if (c.fadeOut > 0) v = Math.min(v, (c.end - t) / c.fadeOut);
  return Math.max(0, Math.min(1, v));
}

/**
 * Computes the value of every target at time `t` (seconds within the loop) into `out`. Targets without a track are not included.
 * With `inside`, also writes whether each target is inside a span (used for 3D visibility).
 */
export function evaluateActivation(tracks: ActivationTrackDef[], t: number, out = new Map<string, number>(), inside?: Map<string, boolean>) {
  out.clear();
  inside?.clear();
  for (const tr of tracks) {
    let v = 0;
    let any = false;
    for (const c of tr.clips) {
      if (!clipInside(c, t)) continue;
      any = true;
      v = Math.max(v, clipValue(c, t));
    }
    out.set(tr.target, Math.max(out.get(tr.target) ?? 0, v));
    if (inside) inside.set(tr.target, (inside.get(tr.target) ?? false) || any);
  }
  return out;
}

// 3D visibility combines several userData flags in refresh(). Never write obj.visible directly; go through the functions here.

/** Number of times a 3D object's visibility changed. The reflection probe recaptures when it increases. */
let visibilityChanges = 0;
export const visibilityVersion = () => visibilityChanges;

function refresh(o: THREE.Object3D) {
  const u = o.userData;
  const shown = u.event === true || ((u.active ?? u.baseVisible !== false) && u.dataVisible !== false && u.eventOnly !== true);
  const v = u.editorHidden !== true && shown;
  if (o.visible !== v) visibilityChanges++;
  o.visible = v;
}

/** Visible in the Inspector (Enabled for components). The visibility where there is no Activation Track span. */
export function setBaseVisible(o: THREE.Object3D, v: boolean) {
  o.userData.baseVisible = v;
  refresh(o);
}

/** Hides with the eye icon in the studio Hierarchy. Not shown even by Activation Tracks. */
export function setEditorHidden(o: THREE.Object3D, h: boolean) {
  o.userData.editorHidden = h;
  refresh(o);
}

/** The Play Timeline's Activation Track. undefined means there is no Track (Visible in the Inspector applies). */
function setActive(o: THREE.Object3D, a: boolean | undefined) {
  if (o.userData.active === a) return;
  o.userData.active = a;
  refresh(o);
}

/**
 * Sets the visibility a component decided from data (for example, hiding objects that are not in the list).
 * Use this instead of writing `visible` directly, so Activation Tracks and Events still apply. Safe to call every frame.
 */
export function setDataVisible(o: THREE.Object3D, v: boolean) {
  if ((o.userData.dataVisible !== false) === v) return;
  o.userData.dataVisible = v;
  refresh(o);
}

/** True while inside a Clip of an Event Timeline's Activation Track. Overrides data and the Play Timeline. */
export function setEventVisible(o: THREE.Object3D, v: boolean) {
  if ((o.userData.event === true) === v) return;
  o.userData.event = v;
  refresh(o);
}

/** Objects with an Activation Track only in Event Timelines are hidden outside the Event's Clips. */
export function setEventOnly(o: THREE.Object3D, v: boolean) {
  if ((o.userData.eventOnly === true) === v) return;
  o.userData.eventOnly = v;
  refresh(o);
}

interface Attached {
  el: HTMLElement;
  value: number | null;
}

const NONE = new Map<string, number>();

/** Holds the current Activation Track values and applies them to the 2D UI parts attached with useActivationRef. */
export class ActivationStore {
  private values = NONE;
  private events = NONE;
  /** Targets with a Track only in Event Timelines (2D UI parts and 3D objects). Hidden outside the Event's Clips. */
  private eventOnly = new Set<string>();
  private attached = new Map<string, Set<Attached>>();

  /** Attaches an element as the 2D UI part `part`. Call the returned function to detach it. */
  attach(part: string, el: HTMLElement) {
    const a: Attached = { el, value: null };
    let set = this.attached.get(part);
    if (!set) this.attached.set(part, (set = new Set()));
    set.add(a);
    this.writeOne(part, a);
    return () => {
      set!.delete(a);
      if (!set!.size) this.attached.delete(part);
    };
  }

  /** Sets the Play Timeline values. Parts not in `values` are shown. null shows everything (Edit in the studio, with no playhead). */
  write(values: Map<string, number> | null) {
    this.values = values ?? NONE;
    this.writeAll();
  }

  /**
   * Sets the targets that have Tracks only in Event Timelines, before any Event plays.
   * 2D UI parts attached before this is set would show until the first frame, so call it as soon as the scene is loaded.
   */
  writeEventOnly(eventOnly: Set<string>) {
    this.eventOnly = eventOnly;
    this.writeAll();
  }

  /** Sets the Event Timeline values. Where they are larger than the Play Timeline values, they are used instead. */
  writeEvents(values: Map<string, number>, eventOnly: Set<string>) {
    this.events = values;
    this.eventOnly = eventOnly;
    this.writeAll();
  }

  /**
   * Returns the current value (0 to 1) of a target (`'object:<name>'`, `'placed:<id>'`, `'component:<id>'`, `'light:<id>'` or `'ui:<part name>'`), including fades.
   * It is 1 for targets without a Track, and 0 outside Events for targets with a Track only in Event Timelines.
   * 3D objects are only shown or hidden by the span; to fade one, read this value and apply it to opacity or similar.
   */
  value(target: string) {
    const fallback = this.eventOnly.has(target) ? 0 : 1;
    return Math.max(this.values.get(target) ?? fallback, this.events.get(target) ?? 0);
  }

  private writeAll() {
    for (const [part, set] of this.attached) for (const a of set) this.writeOne(part, a);
  }

  private writeOne(part: string, a: Attached) {
    const k = 'ui:' + part;
    const v = Math.max(this.values.get(k) ?? (this.eventOnly.has(k) ? 0 : 1), this.events.get(k) ?? 0);
    if (v === a.value) return;
    a.value = v;
    a.el.style.opacity = v >= 1 ? '' : String(v);
    a.el.style.visibility = v > 0 ? '' : 'hidden';
  }
}

/** Provides the {@link ActivationStore} of the current view. */
export const ActivationContext = createContext<ActivationStore>(new ActivationStore());

/**
 * Hands a 2D UI element to Activation Tracks as the part `part`. Pass the returned function to the element's `ref`.
 * List the part names in `parts` of defineOverlay.
 */
export function useActivationRef(part: string) {
  const store = useContext(ActivationContext);
  const detach = useRef<(() => void) | null>(null);
  useEffect(() => () => detach.current?.(), []);
  return useCallback(
    (el: HTMLElement | null) => {
      detach.current?.();
      detach.current = el ? store.attach(part, el) : null;
    },
    [store, part],
  );
}

/** Returns access to the current Activation Track values. Call `value(target)` inside useFrame. A component's own target is `'component:' + props.id`. */
export function useActivation(): Pick<ActivationStore, 'value'> {
  return useContext(ActivationContext);
}

/** Returns the object a Track target points at. `'slot:<component id>'` resolves to that component's object in the slot of `key` (the object given that Key with setSlotKey). */
export function targetObject(handle: SceneHandle, target: string, key?: string | null): THREE.Object3D | undefined {
  const i = target.indexOf(':');
  const kind = target.slice(0, i);
  const id = target.slice(i + 1);
  if (kind === 'object') return handle.objects.get(id);
  if (kind === 'placed') return handle.placed.get(id);
  if (kind === 'component') return handle.components.get(id);
  if (kind === 'light') return handle.lights.get(id);
  if (kind === 'slot' && key != null) {
    const g = handle.components.get(id);
    let found: THREE.Object3D | undefined;
    g?.traverse((o) => {
      if (!found && o.userData.stageKey === key) found = o;
    });
    return found;
  }
  return undefined;
}

/** Tags an object that a component laid out with a Key from the data (such as the id of a list item). Event Timelines pick the object by that Key. */
export function setSlotKey(o: THREE.Object3D, key: string | null) {
  o.userData.stageKey = key;
}

/** Gives an object the Clips that Animation Tracks can play. For objects made from a glb, pass gltf.animations. */
export function setAnimationClips(o: THREE.Object3D, clips: THREE.AnimationClip[]) {
  o.userData.clips = clips;
}

/**
 * Applies Activation Tracks every frame. Place it inside the Canvas.
 * Without `time`, the playback time is used; null shows everything (Edit in the studio, with no playhead).
 */
export function ActivationDirector(props: { tracks: ActivationTrackDef[]; cameras: CameraDef[]; playback: Playback; handle: SceneHandle; time?: number | null }) {
  const { tracks, cameras, playback, handle, time } = props;
  const store = useContext(ActivationContext);
  const total = useMemo(() => cameraTimeline(cameras).total, [cameras]);
  const values = useMemo(() => new Map<string, number>(), []);
  const inside = useMemo(() => new Map<string, boolean>(), []);
  // Objects with an active Track last frame and this frame. Objects that drop out go back to their base visibility.
  const sets = useMemo(() => [new Set<THREE.Object3D>(), new Set<THREE.Object3D>()], []);
  const flip = useRef(0);

  useEffect(
    () => () => {
      for (const s of sets) {
        for (const o of s) setActive(o, undefined);
        s.clear();
      }
      store.write(null);
    },
    [store, sets],
  );

  useFrame(() => {
    const t = time === undefined ? playback.t : time;
    const prev = sets[flip.current];
    const now = sets[1 - flip.current];
    now.clear();
    if (t === null || !tracks.length) {
      store.write(null);
    } else {
      evaluateActivation(tracks, total > 0 ? ((t % total) + total) % total : t, values, inside);
      store.write(values);
      for (const [target, v] of inside) {
        const o = targetObject(handle, target);
        if (!o) continue;
        setActive(o, v);
        now.add(o);
      }
    }
    for (const o of prev) if (!now.has(o)) setActive(o, undefined);
    flip.current = 1 - flip.current;
  }, -1);
  return null;
}

/**
 * Applies the Play Timeline's Animation Tracks every frame. Place it inside the Canvas. Inside a span, the Clip is posed at the time since the span started.
 * The pose is derived from the playback time, so it stays in sync with the camera across loops and when viewed from any point. Does nothing when `active` is false (Edit in the studio).
 */
export function AnimationDirector(props: { tracks: AnimationTrackDef[]; cameras: CameraDef[]; playback: Playback; handle: SceneHandle; active?: boolean }) {
  const { tracks, cameras, playback, handle, active = true } = props;
  const env = useStageEnv();
  const total = useMemo(() => cameraTimeline(cameras).total, [cameras]);
  const st = useMemo(
    () => ({
      mixers: new Map<THREE.Object3D, THREE.AnimationMixer>(),
      running: [new Set<THREE.AnimationAction>(), new Set<THREE.AnimationAction>()],
      flip: 0,
      warned: new Set<string>(),
    }),
    [],
  );

  useEffect(
    () => () => {
      for (const [o, m] of st.mixers) {
        m.stopAllAction();
        m.uncacheRoot(o);
      }
      st.mixers.clear();
    },
    [st],
  );

  useFrame(() => {
    const running = st.running[1 - st.flip];
    const was = st.running[st.flip];
    running.clear();
    if (active && total > 0) {
      const t = ((playback.t % total) + total) % total;
      for (const tr of tracks) {
        const o = targetObject(handle, tr.target);
        if (!o) continue;
        for (const c of tr.clips) {
          if (t < c.start || t >= c.end) continue;
          const clip = (o.userData.clips as THREE.AnimationClip[] | undefined)?.find((x) => x.name === c.clip);
          if (!clip) {
            const text = `Timeline: ${o.name || tr.target} has no Clip ${c.clip}`;
            if (!st.warned.has(text)) {
              st.warned.add(text);
              env.log('warn', text);
            }
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
          a.time = Math.min(t - c.start, clip.duration);
          running.add(a);
        }
      }
    }
    // Stop actions that left their span. Stopping makes three.js restore the position and rotation from before the Clip moved them.
    for (const a of was) if (!running.has(a)) a.stop();
    for (const m of st.mixers.values()) m.update(0);
    st.flip = 1 - st.flip;
  }, -1);
  return null;
}
