import { useEffect, useRef, useState } from 'react';
import { cameraTimeline, eventTimelineLength, registry, useRegistry, type EventTimelineDef, type StageSceneDef } from '@three-stage/runtime';
import type { Draft } from 'immer';
import { beginGesture, edit, editLive, endGesture, newId, parseKey, select, uniqueTimelineName, useHandleVersion, useStudio } from '../store';
import { clipKey, clipsOf, findTrack, itemName } from '../items';
import { events, playback } from '../viewport/Viewport';
import { addCamera } from './Hierarchy';
import { viewFromCamera } from '../keys';

// Timeline tab. On the Camera Track a camera block's length is its Duration, and the hatched area to its right is the Blend into the next camera; the last camera blends back into the first.
// Activation Tracks set when objects are shown. The selector at the top switches to an Event Timeline, which plays once when its event fires.

const PX = 16;
const MIN_DURATION = 0.5;
const MIN_CLIP = 0.1;
const MOVE_PX = 3;
/** Minimum length (s) shown for an Event Timeline, so there is room to place the first Clip */
const EVENT_MIN_LENGTH = 10;

type TrackKind = 'activation' | 'animation';

type Drag =
  | { kind: 'camera'; id: string; x0: number; moved: boolean }
  | { kind: 'duration'; id: string; x0: number; d0: number }
  | { kind: 'blend'; id: string; x0: number; b0: number; d: number }
  | { kind: 'clip'; track: string; id: string; x0: number; s0: number; e0: number; edge: 'move' | 'start' | 'end'; moved: boolean }
  | { kind: 'scrub' };

const snap = (v: number, step: number) => +(Math.round(v / step) * step).toFixed(3);

/** Name of the object a Track shows/hides or animates */
export function targetLabel(target: string, scene: StageSceneDef) {
  const { kind, id } = parseKey(target);
  if (kind === 'ui') return id;
  return itemName(target, scene);
}

function eventTimeline(d: Draft<StageSceneDef>, id: string) {
  return d.timelines.find((t) => t.id === id);
}

function AddTrackMenu({ scene, timeline, kind, onClose }: { scene: StageSceneDef; timeline: EventTimelineDef | null; kind: TrackKind; onClose: () => void }) {
  useRegistry();
  useHandleVersion();
  const handle = useStudio((s) => s.handle);
  const tracks = timeline ? (kind === 'activation' ? timeline.tracks : timeline.animations) : kind === 'activation' ? scene.tracks : scene.animations;
  const used = new Set(tracks.map((t) => t.target));
  const parts = kind === 'activation' ? (registry.overlay()?.parts ?? []).map((p) => 'ui:' + p) : [];
  const objects = [
    ...[...handle.objects.keys()].map((n) => 'object:' + n),
    ...scene.placed.map((p) => 'placed:' + p.id),
    ...(kind === 'activation' ? scene.components.map((c) => 'component:' + c.id) : []),
    ...(kind === 'activation' ? scene.lights.map((l) => 'light:' + l.id) : []),
  ];
  // Objects in a component's slots can only be targeted on an Event Timeline
  const slots = timeline ? scene.components.filter((c) => registry.component(c.type)?.slots).map((c) => 'slot:' + c.id) : [];
  const add = (target: string) => {
    const id = newId('track');
    edit((d) => {
      const tl = timeline ? eventTimeline(d, timeline.id) : null;
      if (!tl) (kind === 'activation' ? d.tracks : d.animations).push({ id, target, clips: [] });
      else if (kind === 'activation') tl.tracks.push({ id, target, clips: [] });
      else tl.animations.push({ id, target, clips: [] });
    });
    onClose();
  };
  const item = (target: string) => (
    <button key={target} className="menu-item" disabled={used.has(target)} onClick={() => add(target)}>
      {targetLabel(target, scene)}
    </button>
  );
  return (
    <div className="menu tl-add-menu" onMouseLeave={onClose}>
      {slots.length > 0 && <div className="menu-group">Key</div>}
      {slots.map(item)}
      {parts.length > 0 && <div className="menu-group">2D UI</div>}
      {parts.map(item)}
      <div className="menu-group">Objects</div>
      {objects.map(item)}
    </div>
  );
}

function TrackMenu({ at, onClose, items }: { at: { x: number; y: number }; onClose: () => void; items: { label: string; f: () => void }[] }) {
  return (
    <div className="menu" style={{ position: 'fixed', left: at.x, top: at.y }} onMouseLeave={onClose}>
      {items.map((it) => (
        <button
          key={it.label}
          className="menu-item"
          onClick={() => {
            it.f();
            onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function TimelinePicker({ scene, current }: { scene: StageSceneDef; current: EventTimelineDef | null }) {
  const show = (id: string | null) => {
    useStudio.setState({ timeline: id });
    select(id ? ['timeline:' + id] : []);
  };
  const add = () => {
    const id = newId('timeline');
    edit((d) => void d.timelines.push({ id, name: uniqueTimelineName('Event', d as StageSceneDef), trigger: { type: 'stage.listChange', params: {} }, tracks: [], animations: [] }));
    show(id);
  };
  return (
    <div className="tl-picker">
      <select className="tl-select" value={current?.id ?? ''} onChange={(e) => show(e.target.value || null)} title="Timeline">
        <option value="">Play</option>
        {scene.timelines.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button className="icon-btn on" onClick={add} title="Add Event Timeline  A Timeline that plays once when an event occurs">
        ＋
      </button>
    </div>
  );
}

export function Timeline() {
  const scene = useStudio((s) => s.scene);
  const selection = useStudio((s) => s.selection);
  const mode = useStudio((s) => s.mode);
  const shownId = useStudio((s) => s.timeline);
  const inner = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const totalRef = useRef(0);
  const [addMenu, setAddMenu] = useState<TrackKind | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: { label: string; f: () => void }[] } | null>(null);

  const current = scene?.timelines.find((t) => t.id === shownId) ?? null;
  const tl = scene && !current ? cameraTimeline(scene.cameras) : { entries: [], total: 0 };
  const length = current ? eventTimelineLength(current) : tl.total;
  totalRef.current = length;
  const currentRef = useRef(current);
  currentRef.current = current;

  // Playhead line. It changes every frame, so write to the element directly instead of using state. On an Event Timeline it is shown only while playing
  useEffect(() => {
    let raf = 0;
    let shown = '';
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = head.current;
      if (!el) return;
      const s = useStudio.getState();
      const total = totalRef.current;
      const ev = currentRef.current;
      let t: number | null;
      if (ev) {
        const p = events.playing.find((x) => x.timelineId === ev.id);
        t = p ? p.t : null;
      } else t = s.mode === 'play' ? (total > 0 ? playback.t % total : 0) : (s.scrubT ?? 0);
      const v = t === null ? 'none' : `${t * PX}px`;
      if (v === shown) return;
      shown = v;
      el.style.display = t === null ? 'none' : 'block';
      if (t !== null) el.style.left = v;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!scene) return null;

  const timeAt = (clientX: number) => (clientX - (inner.current?.getBoundingClientRect().left ?? 0)) / PX;

  const scrub = (clientX: number) => {
    const t = Math.min(Math.max(0, timeAt(clientX)), Math.max(0, totalRef.current - 0.01));
    if (useStudio.getState().mode === 'play') playback.t = t;
    else useStudio.setState({ scrubT: t });
  };

  const down = (d: Drag) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = d;
    if (d.kind === 'duration' || d.kind === 'blend') beginGesture();
    if (d.kind === 'scrub') scrub(e.clientX);
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'scrub') return scrub(e.clientX);
    if (d.kind === 'duration') {
      const v = Math.max(MIN_DURATION, snap(d.d0 + (e.clientX - d.x0) / PX, e.ctrlKey ? 0.5 : 0.1));
      return editLive((s) => {
        const c = s.cameras.find((x) => x.id === d.id);
        if (c) {
          c.duration = v;
          c.blend = Math.min(c.blend, v);
        }
      });
    }
    if (d.kind === 'blend') {
      const v = Math.min(d.d, Math.max(0, snap(d.b0 - (e.clientX - d.x0) / PX, e.ctrlKey ? 0.5 : 0.05)));
      return editLive((s) => {
        const c = s.cameras.find((x) => x.id === d.id);
        if (c) c.blend = v;
      });
    }
    if (!d.moved) {
      if (Math.abs(e.clientX - d.x0) < MOVE_PX) return;
      d.moved = true;
      beginGesture();
    }
    if (d.kind === 'clip') {
      const dt = snap((e.clientX - d.x0) / PX, e.ctrlKey ? 0.5 : 0.1);
      return editLive((s) => {
        const c = (findTrack(s, d.track)?.track.clips as { id: string; start: number; end: number }[] | undefined)?.find((x) => x.id === d.id);
        if (!c) return;
        if (d.edge === 'move') {
          const start = Math.max(0, d.s0 + dt);
          c.start = start;
          c.end = start + (d.e0 - d.s0);
        } else if (d.edge === 'start') c.start = Math.min(Math.max(0, d.s0 + dt), d.e0 - MIN_CLIP);
        else c.end = Math.max(d.s0 + MIN_CLIP, d.e0 + dt);
      });
    }
    // Reorder cameras. Swap once dragged past the middle of the neighboring block
    const t = timeAt(e.clientX);
    const { entries } = cameraTimeline(useStudio.getState().scene!.cameras);
    const i = entries.findIndex((x) => x.camera.id === d.id);
    const prev = entries[i - 1];
    const next = entries[i + 1];
    const swap = (j: number) =>
      editLive((s) => {
        [s.cameras[i], s.cameras[j]] = [s.cameras[j], s.cameras[i]];
      });
    if (prev && t < prev.start + prev.duration / 2) swap(i - 1);
    else if (next && t > next.start + next.duration / 2) swap(i + 1);
  };

  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind === 'scrub') return;
    if (d.kind === 'duration' || d.kind === 'blend' || d.moved) endGesture();
    else if (d.kind === 'camera') select(['camera:' + d.id]);
    else select([clipKey(d.track, d.id)]);
  };

  const addClip = (trackId: string, at: number) => {
    const id = newId('clip');
    const start = snap(Math.max(0, at), 0.1);
    const f = findTrack(scene, trackId);
    if (!f) return;
    if (f.kind === 'animation') {
      // The first Clip spans its animation's length
      const clip = clipsOf(f.track.target)[0];
      const end = start + Math.max(MIN_CLIP, clip?.duration ?? 2);
      edit((d) => {
        const x = findTrack(d, trackId);
        if (x?.kind === 'animation') x.track.clips.push({ id, start, end, clip: clip?.name ?? '' });
      });
    } else {
      edit((d) => {
        const x = findTrack(d, trackId);
        if (x?.kind === 'activation') x.track.clips.push({ id, start, end: start + 5, fadeIn: 0, fadeOut: 0 });
      });
    }
    select([clipKey(trackId, id)]);
  };

  const removeTrack = (trackId: string) =>
    edit((d) => {
      d.tracks = d.tracks.filter((t) => t.id !== trackId);
      d.animations = d.animations.filter((t) => t.id !== trackId);
      for (const x of d.timelines) {
        x.tracks = x.tracks.filter((t) => t.id !== trackId);
        x.animations = x.animations.filter((t) => t.id !== trackId);
      }
    });

  const rows: { kind: TrackKind; id: string; target: string; clips: { id: string; start: number; end: number; fadeIn?: number; fadeOut?: number; clip?: string }[] }[] = current
    ? [...current.tracks.map((t) => ({ kind: 'activation' as const, ...t })), ...current.animations.map((t) => ({ kind: 'animation' as const, ...t }))]
    : [...scene.tracks.map((t) => ({ kind: 'activation' as const, ...t })), ...scene.animations.map((t) => ({ kind: 'animation' as const, ...t }))];

  const first = tl.entries[0];
  const ghostW = first ? first.duration * PX : 0;
  const shownLength = current ? Math.max(length, EVENT_MIN_LENGTH) : tl.total;
  const width = shownLength * PX + ghostW + 40;
  const ticks = Array.from({ length: Math.floor(shownLength) + 1 }, (_, i) => i);

  return (
    <div className="timeline">
      <div className="tl-heads">
        <div className="tl-head ruler-head">
          <TimelinePicker scene={scene} current={current} />
          <span>{length > 0 ? `${+length.toFixed(1)} s` : ''}</span>
        </div>
        {!current && (
          <div className="tl-head cameras">
            Camera Track
            <button className="icon-btn on" onClick={addCamera} disabled={mode !== 'edit'} title="Add Camera  From the current view">
              ＋
            </button>
          </div>
        )}
        {rows.map((tr) => (
          <div
            key={tr.id}
            className="tl-head track"
            title={tr.target}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, items: [{ label: 'Delete', f: () => removeTrack(tr.id) }] });
            }}
          >
            <span className="tl-track-name">{targetLabel(tr.target, scene)}</span>
            {tr.kind === 'animation' && <span className="tl-track-kind">Animation</span>}
          </div>
        ))}
        <div className="tl-head add-track menu-anchor">
          <button className="small-btn" onClick={() => setAddMenu(addMenu === 'activation' ? null : 'activation')}>
            Add Activation Track
          </button>
          {addMenu === 'activation' && <AddTrackMenu scene={scene} timeline={current} kind="activation" onClose={() => setAddMenu(null)} />}
        </div>
        <div className="tl-head add-track menu-anchor">
          <button className="small-btn" onClick={() => setAddMenu(addMenu === 'animation' ? null : 'animation')}>
            Add Animation Track
          </button>
          {addMenu === 'animation' && <AddTrackMenu scene={scene} timeline={current} kind="animation" onClose={() => setAddMenu(null)} />}
        </div>
      </div>
      <div className="tl-scroll">
        <div className="tl-inner" ref={inner} style={{ width }} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
          <div className={'tl-ruler' + (current ? ' fixed' : '')} onPointerDown={current ? undefined : down({ kind: 'scrub' })}>
            {ticks.map((i) => (
              <span key={i} className={'tl-tick' + (i % 5 === 0 ? ' major' : '')} style={{ left: i * PX }}>
                {i % 5 === 0 ? i : ''}
              </span>
            ))}
          </div>
          {!current && (
            <div className="tl-row cameras">
              {tl.entries.map((e) => {
                const k = 'camera:' + e.camera.id;
                const blendW = Math.min(Math.max(0, e.camera.blend), e.duration) * PX;
                return (
                  <div
                    key={e.camera.id}
                    className={'camera-block' + (selection.includes(k) ? ' selected' : '')}
                    style={{ left: e.start * PX, width: e.duration * PX - 2 }}
                    onPointerDown={(ev) => down({ kind: 'camera', id: e.camera.id, x0: ev.clientX, moved: false })(ev)}
                    onDoubleClick={() => viewFromCamera(e.camera.id)}
                  >
                    <span className="camera-name">{e.camera.name}</span>
                    <span className="camera-sec">{+e.duration.toFixed(2)} s</span>
                    <span className="blend" style={{ width: blendW }} />
                    <span
                      className="tl-handle blend-handle"
                      style={{ right: blendW - 4 }}
                      onPointerDown={(ev) => down({ kind: 'blend', id: e.camera.id, x0: ev.clientX, b0: e.camera.blend, d: e.duration })(ev)}
                      title="Blend"
                    />
                    <span
                      className="tl-handle end-handle"
                      onPointerDown={(ev) => down({ kind: 'duration', id: e.camera.id, x0: ev.clientX, d0: e.camera.duration })(ev)}
                      title="Duration"
                    />
                  </div>
                );
              })}
              {first && (
                <div className="camera-block ghost" style={{ left: tl.total * PX, width: ghostW - 2 }}>
                  <span className="camera-name">↻ {first.camera.name}</span>
                </div>
              )}
            </div>
          )}
          {rows.map((tr) => {
            const ui = tr.target.startsWith('ui:');
            return (
              <div
                key={tr.id}
                className="tl-row track"
                onContextMenu={(e) => {
                  e.preventDefault();
                  const at = timeAt(e.clientX);
                  setMenu({ x: e.clientX, y: e.clientY, items: [{ label: 'Add Clip', f: () => addClip(tr.id, at) }] });
                }}
                onDoubleClick={(e) => e.target === e.currentTarget && addClip(tr.id, timeAt(e.clientX))}
              >
                {tr.clips.map((c) => {
                  const k = clipKey(tr.id, c.id);
                  const w = (c.end - c.start) * PX;
                  const clip = (edge: 'move' | 'start' | 'end') => (ev: React.PointerEvent) =>
                    down({ kind: 'clip', track: tr.id, id: c.id, x0: ev.clientX, s0: c.start, e0: c.end, edge, moved: false })(ev);
                  return (
                    <div
                      key={c.id}
                      className={'clip-block' + (tr.kind === 'animation' ? ' anim' : '') + (selection.includes(k) ? ' selected' : '')}
                      style={{ left: c.start * PX, width: w - 2 }}
                      onPointerDown={clip('move')}
                    >
                      {tr.kind === 'animation' && <span className="clip-name">{c.clip || 'None'}</span>}
                      {ui && (c.fadeIn ?? 0) > 0 && <span className="fade in" style={{ width: Math.min((c.fadeIn ?? 0) * PX, w) }} />}
                      {ui && (c.fadeOut ?? 0) > 0 && <span className="fade out" style={{ width: Math.min((c.fadeOut ?? 0) * PX, w) }} />}
                      <span className="tl-handle start-handle" onPointerDown={clip('start')} title="Start" />
                      <span className="tl-handle end-handle" onPointerDown={clip('end')} title="End" />
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div className="tl-loop" style={{ left: length * PX }} />
          <div className="tl-playhead" ref={head} />
        </div>
      </div>
      {menu && <TrackMenu at={menu} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
