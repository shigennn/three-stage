import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import {
  SceneHandle,
  normalizeScene,
  serializeScene,
  type ItemRef,
  type LogLevel,
  type StageSceneDef,
  type StageSettings,
} from '@three-stage/runtime';
import { gitStatus, listFiles, readText, saveText, type FileInfo, type GitStatus } from './api';

/**
 * The selection: 'object:<name>', 'placed:id', 'light:id', 'component:id', 'empty:id', 'camera:id', 'clip:<track id>:<clip id>',
 * 'timeline:id' (an Event Timeline), 'material:id', 'asset:<path>', 'environment'
 */
export type ItemKey = string;

export const keyOf = (ref: ItemRef): ItemKey =>
  ref.kind === 'object' ? `object:${ref.name}` : ref.kind === 'asset' ? `asset:${ref.path}` : `${ref.kind}:${ref.id}`;

export function parseKey(key: ItemKey): { kind: string; id: string } {
  const i = key.indexOf(':');
  return i < 0 ? { kind: key, id: '' } : { kind: key.slice(0, i), id: key.slice(i + 1) };
}

export interface LogEntry {
  id: number;
  time: Date;
  level: LogLevel;
  text: string;
  ref?: ItemRef;
}

export type GizmoMode = 'translate' | 'rotate' | 'scale';

/** What the Viewport overlays. Grouped like Blender's Viewport Overlays */
export interface Overlays {
  grid: boolean;
  axisX: boolean;
  axisY: boolean;
  axisZ: boolean;
  wireframe: boolean;
  ui: boolean;
  aspectRatio: boolean;
}

/** Viewport gizmos. `show` turns all of them on or off */
export interface Gizmos {
  show: boolean;
  viewHelper: boolean;
  transformControls: boolean;
  lightHelpers: boolean;
  empties: boolean;
}

const UNDO_LIMIT = 200;
const LAST_SCENE_KEY = 'three-stage:last-scene';

interface StudioState {
  project: { name: string; dir: string } | null;
  files: FileInfo[];
  versions: Record<string, number>;
  scenePath: string | null;
  scene: StageSceneDef | null;
  savedText: string | null;
  savedMtime: number;
  dirty: boolean;
  externalChange: boolean;
  undo: StageSceneDef[];
  redo: StageSceneDef[];
  gestureBase: StageSceneDef | null;
  lastCoalesce: { key: string; at: number } | null;

  selection: ItemKey[];
  mode: 'edit' | 'play';
  /** Paused. In both Edit and Play, stops code-driven motion, Clips, Timeline playback and the mock data clock */
  paused: boolean;
  settings: StageSettings;
  hidden: Set<string>;
  locked: Set<string>;
  overlays: Overlays;
  gizmos: Gizmos;
  /** Performance numbers at the top right of the Viewport */
  stats: boolean;
  /** Draws the Edit view with an OrthographicCamera. Not saved to the Scene */
  orthographic: boolean;
  gizmo: GizmoMode;
  bottomTab: 'timeline' | 'data' | 'console' | 'profiler';
  logs: LogEntry[];
  /** A message shown briefly at the bottom of the screen (save and Publish results) */
  toast: { text: string; level: LogLevel; n: number } | null;
  renderSettingsOpen: boolean;
  eyedropper: ((name: string) => void) | null;
  mock: { minutes: number; speed: number; variant: string };
  /** When changed, the Viewport shows the view from this camera */
  cameraView: { id: string; n: number } | null;
  /** Timeline playhead (seconds). Moving it in Edit shows the camera and visibility at that time. Play starts from here */
  scrubT: number | null;
  /** id of the Event Timeline shown in the Timeline tab. null means the Play Timeline */
  timeline: string | null;

  handle: SceneHandle;
  /** Git state of the project folder. repo: false when it is not a git repository */
  git: GitStatus | null;
}

export const useStudio = create<StudioState>(() => ({
  project: null,
  files: [],
  versions: {},
  scenePath: null,
  scene: null,
  savedText: null,
  savedMtime: 0,
  dirty: false,
  externalChange: false,
  undo: [],
  redo: [],
  gestureBase: null,
  lastCoalesce: null,

  selection: [],
  mode: 'edit',
  paused: false,
  settings: { quality: 'high', resolution: '1080p', limitFps: true },
  hidden: new Set(),
  locked: new Set(),
  overlays: { grid: true, axisX: true, axisY: false, axisZ: true, wireframe: false, ui: true, aspectRatio: true },
  gizmos: { show: true, viewHelper: true, transformControls: true, lightHelpers: true, empties: true },
  stats: true,
  orthographic: false,
  gizmo: 'translate',
  bottomTab: 'timeline',
  logs: [],
  toast: null,
  renderSettingsOpen: false,
  eyedropper: null,
  mock: { minutes: 12 * 60 + 15, speed: 60, variant: '' },
  cameraView: null,
  scrubT: null,
  timeline: null,

  handle: new SceneHandle(),
  git: null,
}));

const get = useStudio.getState;
const set = useStudio.setState;

/** Re-renders when drawn objects (glb objects, lights, etc.) are added or removed, since they live outside the store */
export function useHandleVersion() {
  const handle = useStudio((s) => s.handle);
  const [v, setV] = useState(handle.version);
  useEffect(() => handle.subscribe(() => setV(handle.version)), [handle]);
  return v;
}

// If only this file were hot-reloaded, a new empty store would be created and the open scene and unsaved changes would vanish from the screen.
// Reload the whole page instead (the close prompt appears if there are unsaved changes)
import.meta.hot?.accept(() => location.reload());

let logId = 0;
export function log(level: LogLevel, text: string, ref?: ItemRef) {
  const e: LogEntry = { id: ++logId, time: new Date(), level, text, ref };
  set((s) => ({ logs: [...s.logs.slice(-499), e] }));
  if (level === 'error') console.error(text);
}

/** Logs to the Console and shows a toast, so the result of an action is visible with the Console closed */
export function notify(level: LogLevel, text: string, ref?: ItemRef) {
  log(level, text, ref);
  set((s) => ({ toast: { text, level, n: (s.toast?.n ?? 0) + 1 } }));
}

export function setPlaying(play: boolean) {
  set({ mode: play ? 'play' : 'edit', paused: false });
}

function computeDirty(scene: StageSceneDef | null, saved: string | null) {
  return !!scene && serializeScene(scene) !== saved;
}

/** The default branch is read-only; edits happen on another branch */
export const isReadOnly = () => !!get().git?.readOnly;

let lockedNoticeAt = 0;
/** When read-only, notifies and returns true. Called repeatedly while dragging, so notifications are throttled */
export function blockedByBranch() {
  if (!isReadOnly()) return false;
  const now = performance.now();
  if (now - lockedNoticeAt > 3000) {
    lockedNoticeAt = now;
    notify('warn', `${get().git?.branch} is read-only. To edit, create or select a branch from Branch in the Toolbar`);
  }
  return true;
}

export async function refreshGit() {
  try {
    set({ git: await gitStatus() });
  } catch {
    set({ git: { repo: false } });
  }
  return get().git;
}

/** Changes the scene and pushes the previous state onto the undo stack. Consecutive edits with the same `coalesce` are merged into one */
export function edit(recipe: (d: Draft<StageSceneDef>) => void, opts: { coalesce?: string } = {}) {
  const s = get();
  if (!s.scene || blockedByBranch()) return;
  const next = produce(s.scene, recipe);
  if (next === s.scene) return;
  const now = performance.now();
  const merge = !!opts.coalesce && s.lastCoalesce?.key === opts.coalesce && now - s.lastCoalesce.at < 800;
  set({
    scene: next,
    undo: merge ? s.undo : [...s.undo.slice(-(UNDO_LIMIT - 1)), s.scene],
    redo: [],
    dirty: computeDirty(next, s.savedText),
    lastCoalesce: opts.coalesce ? { key: opts.coalesce, at: now } : null,
  });
}

/** While dragging, changes the scene without pushing undo, and pushes a single entry on release */
export function beginGesture() {
  const s = get();
  if (s.scene && !s.gestureBase) set({ gestureBase: s.scene });
}

export function editLive(recipe: (d: Draft<StageSceneDef>) => void) {
  const s = get();
  if (!s.scene || blockedByBranch()) return;
  const next = produce(s.scene, recipe);
  if (next !== s.scene) set({ scene: next });
}

export function endGesture() {
  const s = get();
  const base = s.gestureBase;
  if (!base || !s.scene) return set({ gestureBase: null });
  if (base === s.scene) return set({ gestureBase: null });
  set({
    gestureBase: null,
    undo: [...s.undo.slice(-(UNDO_LIMIT - 1)), base],
    redo: [],
    dirty: computeDirty(s.scene, s.savedText),
    lastCoalesce: null,
  });
}

export function cancelGesture() {
  const s = get();
  if (s.gestureBase) set({ scene: s.gestureBase, gestureBase: null });
}

export function undo() {
  if (get().gestureBase) endGesture();
  const s = get();
  if (!s.scene || !s.undo.length) return;
  const prev = s.undo[s.undo.length - 1];
  set({ scene: prev, undo: s.undo.slice(0, -1), redo: [...s.redo, s.scene], dirty: computeDirty(prev, s.savedText), lastCoalesce: null });
}

export function redo() {
  if (get().gestureBase) endGesture();
  const s = get();
  if (!s.scene || !s.redo.length) return;
  const next = s.redo[s.redo.length - 1];
  set({ scene: next, redo: s.redo.slice(0, -1), undo: [...s.undo, s.scene], dirty: computeDirty(next, s.savedText), lastCoalesce: null });
}

export function select(keys: ItemKey[], additive = false) {
  const s = get();
  if (additive) {
    const cur = new Set(s.selection);
    for (const k of keys) cur.has(k) ? cur.delete(k) : cur.add(k);
    set({ selection: [...cur] });
  } else set({ selection: keys });
}

export async function refreshFiles() {
  const r = await listFiles();
  const versions = { ...get().versions };
  set({ project: r.project, files: r.files, versions });
  return r.files;
}

export async function openScene(path: string, opts: { keepHistory?: boolean } = {}) {
  const text = await readText(path);
  let scene: StageSceneDef;
  try {
    scene = normalizeScene(JSON.parse(text));
  } catch (e: any) {
    log('error', `Cannot open ${path}: ${e.message}`, { kind: 'asset', path });
    return;
  }
  const s = get();
  const keep = opts.keepHistory && s.scenePath === path && s.scene;
  const mtime = s.files.find((f) => f.path === path)?.mtime ?? 0;
  set({
    scenePath: path,
    scene,
    savedText: serializeScene(scene),
    savedMtime: mtime,
    dirty: false,
    externalChange: false,
    undo: keep ? [...s.undo, s.scene!] : [],
    redo: [],
    selection: keep ? s.selection : [],
  });
  try {
    localStorage.setItem(LAST_SCENE_KEY, path);
  } catch {}
  if (scene.schemaVersion !== JSON.parse(text).schemaVersion) log('info', `Converted ${path} to the new format. Saving writes the new format`);
}

export function lastScene(): string | null {
  try {
    return localStorage.getItem(LAST_SCENE_KEY);
  } catch {
    return null;
  }
}

/** Content we wrote ourselves. The file watcher's notification arrives before the save response, so remember it to avoid mistaking it for an external change */
let written: string | null = null;
export const lastWritten = () => written;

/** Returns true if saved */
export async function save() {
  const s = get();
  if (!s.scene || !s.scenePath || blockedByBranch()) return false;
  const text = serializeScene(s.scene);
  written = text;
  try {
    const r = await saveText(s.scenePath, text);
    set({ savedText: text, savedMtime: r.mtime, dirty: computeDirty(get().scene, text), externalChange: false });
    notify('info', `Saved ${s.scenePath}`);
    return true;
  } catch (e: any) {
    notify('error', `Could not save: ${e.message}`);
    return false;
  }
}

/** Reloads a Scene file that was changed externally. The state before reloading can be restored with Ctrl+Z */
export async function reload() {
  const s = get();
  if (!s.scenePath) return;
  await openScene(s.scenePath, { keepHistory: true });
  log('info', `Reloaded ${s.scenePath} from the file`);
}

export async function saveAs(path: string) {
  const s = get();
  if (!s.scene || blockedByBranch()) return;
  const text = serializeScene(s.scene);
  written = text;
  try {
    await saveText(path, text);
  } catch (e: any) {
    notify('error', `Could not save: ${e.message}`);
    return;
  }
  await refreshFiles();
  await openScene(path);
  notify('info', `Saved as ${path}`);
}

let idSeq = 0;
export function newId(prefix: string) {
  const s = get().scene;
  const used = new Set<string>();
  if (s) {
    const tracks = [...s.tracks, ...s.timelines.flatMap((t) => [...t.tracks, ...t.animations])];
    for (const list of [s.placed, s.lights, s.components, s.empties, s.cameras, s.postprocess, s.timelines, tracks, ...tracks.map((t) => t.clips)] as { id: string }[][])
      list.forEach((x) => used.add(x.id));
    for (const id of Object.keys(s.materials)) used.add(id);
  }
  let id: string;
  do id = `${prefix}-${(++idSeq).toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;
  while (used.has(id));
  return id;
}

/** If `scene` is given, compares against its names (inside edit, to include changes not yet committed) */
export function uniqueName(base: string, scene?: StageSceneDef) {
  const s = scene ?? get().scene;
  const used = new Set<string>();
  if (s) {
    for (const list of [s.placed, s.lights, s.components, s.empties, s.cameras] as { name: string }[][]) list.forEach((x) => used.add(x.name));
    for (const name of get().handle.objects.keys()) used.add(name);
  }
  return numbered(base, used);
}

/** Name of an Event Timeline. Events are called by name, so it must not collide with other Event Timelines */
export function uniqueTimelineName(base: string, scene?: StageSceneDef) {
  const s = scene ?? get().scene;
  return numbered(base, new Set(s?.timelines.map((t) => t.name)));
}

function numbered(base: string, used: Set<string>) {
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}
