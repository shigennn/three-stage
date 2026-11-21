import * as THREE from 'three';
import type { Draft } from 'immer';
import {
  registry,
  targetObject,
  type ActivationTrackDef,
  type AnimationTrackDef,
  type EventTimelineDef,
  type StageSceneDef,
  type TransformDef,
  type Vec3,
} from '@three-stage/runtime';
import { newId, parseKey, uniqueName, uniqueTimelineName, useStudio, type ItemKey } from './store';
import { viewport } from './viewport/refs';

const R2D = 180 / Math.PI;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function itemObject(key: ItemKey): THREE.Object3D | undefined {
  const h = useStudio.getState().handle;
  const { kind, id } = parseKey(key);
  if (kind === 'object') return h.objects.get(id);
  if (kind === 'placed') return h.placed.get(id);
  if (kind === 'component') return h.components.get(id);
  if (kind === 'light') return h.lights.get(id);
  if (kind === 'empty') return h.empties.get(id);
  return undefined;
}

type Named = { id: string; name: string };

function namedList(s: StageSceneDef | Draft<StageSceneDef>, kind: string): Named[] {
  if (kind === 'placed') return s.placed;
  if (kind === 'light') return s.lights;
  if (kind === 'component') return s.components;
  if (kind === 'empty') return s.empties;
  if (kind === 'camera') return s.cameras;
  if (kind === 'timeline') return s.timelines;
  return [];
}

export type FoundTrack =
  | { kind: 'activation'; track: ActivationTrackDef; timeline: EventTimelineDef | null }
  | { kind: 'animation'; track: AnimationTrackDef; timeline: EventTimelineDef | null };

/** Finds a track in either the Play Timeline or an Event Timeline */
export function findTrack<S extends StageSceneDef | Draft<StageSceneDef>>(s: S, trackId: string): FoundTrack | null {
  const main = s.tracks.find((t) => t.id === trackId);
  if (main) return { kind: 'activation', track: main as ActivationTrackDef, timeline: null };
  const anim = s.animations.find((t) => t.id === trackId);
  if (anim) return { kind: 'animation', track: anim as AnimationTrackDef, timeline: null };
  for (const tl of s.timelines) {
    const a = tl.tracks.find((t) => t.id === trackId);
    if (a) return { kind: 'activation', track: a as ActivationTrackDef, timeline: tl as EventTimelineDef };
    const b = tl.animations.find((t) => t.id === trackId);
    if (b) return { kind: 'animation', track: b as AnimationTrackDef, timeline: tl as EventTimelineDef };
  }
  return null;
}

/** Clips playable by an Animation Track's target. 'slot:' targets are objects a component laid out */
export function clipsOf(target: string): THREE.AnimationClip[] {
  const h = useStudio.getState().handle;
  const { kind, id } = parseKey(target);
  let o: THREE.Object3D | undefined;
  if (kind === 'slot') {
    h.components.get(id)?.traverse((x) => {
      if (!o && (x.userData.clips as unknown[] | undefined)?.length) o = x;
    });
  } else o = targetObject(h, target);
  return (o?.userData.clips as THREE.AnimationClip[] | undefined) ?? [];
}

/** Removes tracks that point at a deleted object. 'slot:' refers to an object in that component's slots */
function dropTracks(d: Draft<StageSceneDef>, key: ItemKey) {
  const { kind, id } = parseKey(key);
  const gone = (t: { target: string }) => t.target === key || (kind === 'component' && t.target === 'slot:' + id);
  d.tracks = d.tracks.filter((t) => !gone(t));
  for (const tl of d.timelines) {
    tl.tracks = tl.tracks.filter((t) => !gone(t));
    tl.animations = tl.animations.filter((t) => !gone(t));
  }
}

export function itemName(key: ItemKey, s: StageSceneDef | null): string {
  const { kind, id } = parseKey(key);
  if (!s) return id;
  if (kind === 'object') return id;
  if (kind === 'environment') return 'Environment';
  if (kind === 'slot') return `${namedList(s, 'component').find((x) => x.id === id)?.name ?? id} [Key]`;
  return namedList(s, kind).find((x) => x.id === id)?.name ?? id;
}

/** Whether it can be moved (targeted by the gizmo and G/R/S) */
export function isTransformable(key: ItemKey) {
  const k = parseKey(key).kind;
  return k === 'object' || k === 'placed' || k === 'component' || k === 'light' || k === 'empty';
}

/** Current position, rotation and scale. For glTF objects without an override, the values from the file */
export function readTransform(key: ItemKey, s: StageSceneDef): Required<TransformDef> | null {
  const { kind, id } = parseKey(key);
  const fromObj = (o: THREE.Object3D | undefined): Required<TransformDef> | null => {
    if (!o) return null;
    const base = o.userData.base as { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 } | undefined;
    const p = base?.p ?? o.position;
    const e = new THREE.Euler().setFromQuaternion(base?.q ?? o.quaternion, 'XYZ');
    const sc = base?.s ?? o.scale;
    return { position: [r4(p.x), r4(p.y), r4(p.z)], rotation: [r4(e.x * R2D), r4(e.y * R2D), r4(e.z * R2D)], scale: [r4(sc.x), r4(sc.y), r4(sc.z)] };
  };
  if (kind === 'object') {
    const base = fromObj(itemObject(key));
    const o = s.overrides[id];
    if (!base) return null;
    return { position: o?.position ?? base.position, rotation: o?.rotation ?? base.rotation, scale: o?.scale ?? base.scale };
  }
  const def =
    kind === 'placed' ? s.placed.find((x) => x.id === id) : kind === 'component' ? s.components.find((x) => x.id === id) : undefined;
  if (def) return { position: def.position ?? [0, 0, 0], rotation: def.rotation ?? [0, 0, 0], scale: def.scale ?? [1, 1, 1] };
  if (kind === 'light') {
    const l = s.lights.find((x) => x.id === id);
    return l ? { position: l.position, rotation: [0, 0, 0], scale: [1, 1, 1] } : null;
  }
  if (kind === 'empty') {
    const e = s.empties.find((x) => x.id === id);
    if (!e) return null;
    const b = parentBase(e.parent);
    return { position: [r4(e.position[0] + b.x), r4(e.position[1] + b.y), r4(e.position[2] + b.z)], rotation: [0, 0, 0], scale: [1, 1, 1] };
  }
  return null;
}

/**
 * World position of an Empty's Parent, or the origin when there is no Parent or it cannot be found.
 * An Empty's position is an offset from its Parent in world axes, while the gizmo and G work in world space
 */
export function parentBase(parent: string | undefined): THREE.Vector3 {
  const o = parent ? viewport.scene?.getObjectByName(parent) : undefined;
  return o ? o.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
}

export function writeTransform(d: Draft<StageSceneDef>, key: ItemKey, t: TransformDef) {
  const { kind, id } = parseKey(key);
  const round = (v?: Vec3) => (v ? (v.map(r4) as Vec3) : undefined);
  const apply = (o: TransformDef) => {
    if (t.position) o.position = round(t.position);
    if (t.rotation) o.rotation = round(t.rotation);
    if (t.scale) o.scale = round(t.scale);
  };
  if (kind === 'object') {
    d.overrides[id] = d.overrides[id] ?? {};
    apply(d.overrides[id]);
  } else if (kind === 'placed') {
    const p = d.placed.find((x) => x.id === id);
    if (p) apply(p);
  } else if (kind === 'component') {
    const c = d.components.find((x) => x.id === id);
    if (c) apply(c);
  } else if (kind === 'light') {
    const l = d.lights.find((x) => x.id === id);
    if (l && t.position) l.position = round(t.position)!;
  } else if (kind === 'empty') {
    const e = d.empties.find((x) => x.id === id);
    if (!e || !t.position) return;
    const b = parentBase(e.parent);
    e.position = round([t.position[0] - b.x, t.position[1] - b.y, t.position[2] - b.z])!;
  }
}

/** Reads an Object3D's transform back into a TransformDef, e.g. after a gizmo drag */
export function transformFromObject(o: THREE.Object3D): TransformDef {
  const e = new THREE.Euler().setFromQuaternion(o.quaternion, 'XYZ');
  return {
    position: [o.position.x, o.position.y, o.position.z],
    rotation: [e.x * R2D, e.y * R2D, e.z * R2D],
    scale: [o.scale.x, o.scale.y, o.scale.z],
  };
}

export function canDelete(key: ItemKey) {
  const k = parseKey(key).kind;
  return k === 'placed' || k === 'light' || k === 'component' || k === 'empty' || k === 'camera' || k === 'clip' || k === 'timeline';
}

export const clipKey = (trackId: string, clipId: string) => `clip:${trackId}:${clipId}`;

export function parseClipKey(key: ItemKey) {
  const [, trackId, clipId] = key.split(':');
  return { trackId, clipId };
}

export function deleteItem(d: Draft<StageSceneDef>, key: ItemKey) {
  const { kind, id } = parseKey(key);
  if (kind === 'clip') {
    const { trackId, clipId } = parseClipKey(key);
    const tr = findTrack(d, trackId)?.track as { clips: { id: string }[] } | undefined;
    if (tr) tr.clips = tr.clips.filter((c) => c.id !== clipId);
    return;
  }
  if (kind === 'timeline') {
    d.timelines = d.timelines.filter((t) => t.id !== id);
    return;
  }
  if (kind === 'placed') {
    const p = d.placed.find((x) => x.id === id);
    d.placed = d.placed.filter((x) => x.id !== id);
    if (p) d.materialAssignments = d.materialAssignments.filter((a) => a.object !== p.name);
  }
  if (kind === 'light') d.lights = d.lights.filter((x) => x.id !== id);
  if (kind === 'component') d.components = d.components.filter((x) => x.id !== id);
  if (kind === 'empty') d.empties = d.empties.filter((x) => x.id !== id);
  if (kind === 'camera') d.cameras = d.cameras.filter((x) => x.id !== id);
  dropTracks(d, key);
}

export function duplicateItem(d: Draft<StageSceneDef>, key: ItemKey): ItemKey | null {
  const { kind, id } = parseKey(key);
  if (kind === 'clip') {
    const { trackId, clipId } = parseClipKey(key);
    const f = findTrack(d, trackId);
    const clips = f?.track.clips as { id: string; start: number; end: number }[] | undefined;
    const src = clips?.find((c) => c.id === clipId);
    if (!f || !clips || !src) return null;
    const len = src.end - src.start;
    const c = { ...src, id: newId('clip'), start: src.end, end: src.end + len };
    clips.push(c);
    return clipKey(f.track.id, c.id);
  }
  if (kind === 'timeline') {
    const src = d.timelines.find((t) => t.id === id);
    if (!src) return null;
    const c = JSON.parse(JSON.stringify(src)) as EventTimelineDef;
    c.id = newId('timeline');
    c.name = uniqueTimelineName(src.name.replace(/ \d+$/, ''), d as StageSceneDef);
    for (const tr of [...c.tracks, ...c.animations]) {
      tr.id = newId('track');
      for (const x of tr.clips) x.id = newId('clip');
    }
    d.timelines.splice(d.timelines.indexOf(src) + 1, 0, c);
    return 'timeline:' + c.id;
  }
  const list = namedList(d, kind);
  const src = list.find((x) => x.id === id);
  if (!src) return null;
  const c = JSON.parse(JSON.stringify(src)) as Named;
  c.id = newId(kind);
  c.name = uniqueName(src.name.replace(/ \d+$/, ''), d as StageSceneDef);
  list.splice(list.indexOf(src) + 1, 0, c);
  if (kind === 'placed') {
    for (const a of d.materialAssignments.filter((x) => x.object === src.name)) d.materialAssignments.push({ ...a, object: c.name });
  }
  return `${kind}:${c.id}`;
}

/** Updates every reference by name after a rename. A new definition field that refers to items by name must be handled here */
function renameRefs(d: Draft<StageSceneDef>, from: string, to: string) {
  for (const c of d.components) {
    const def = registry.component(c.type);
    for (const [k, kind] of Object.entries(def?.binding ?? {})) if (kind === 'node' && c.binding[k] === from) c.binding[k] = to;
    for (const [k, p] of Object.entries(def?.params ?? {})) if (p.type === 'object' && c.params[k] === from) c.params[k] = to;
  }
  for (const e of d.empties) if (e.parent === from) e.parent = to;
  for (const l of d.lights) if (l.targetObject === from) l.targetObject = to;
  for (const c of d.cameras) if (c.targetObject === from) c.targetObject = to;
}

/** Only items added in the studio can be renamed. glTF object names come from the file */
export function canRename(key: ItemKey) {
  return canDelete(key) && parseKey(key).kind !== 'clip';
}

export function renameItem(d: Draft<StageSceneDef>, key: ItemKey, name: string) {
  const { kind, id } = parseKey(key);
  const x = namedList(d, kind).find((i) => i.id === id);
  if (!x) return;
  if (kind === 'placed') for (const a of d.materialAssignments) if (a.object === x.name) a.object = name;
  if (kind === 'placed' || kind === 'component' || kind === 'empty') renameRefs(d, x.name, name);
  x.name = name;
}
