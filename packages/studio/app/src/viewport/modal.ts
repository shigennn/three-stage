import * as THREE from 'three';
import type { TransformDef, Vec3 } from '@three-stage/runtime';
import { beginGesture, cancelGesture, editLive, endGesture, parseKey, useStudio, type ItemKey } from '../store';
import { itemObject, readTransform, writeTransform } from '../items';
import { viewport } from './refs';

// Blender's G/R/S. Pressing the key makes the object follow the mouse; X/Y/Z constrain the axis, and typing a number sets the value.
// Left click or Enter confirms; right click or Esc cancels. Ctrl snaps to increments.

type Mode = 'G' | 'R' | 'S';
type Axis = 'x' | 'y' | 'z' | null;

const AXES: Record<'x' | 'y' | 'z', THREE.Vector3> = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

interface State {
  mode: Mode;
  keys: ItemKey[];
  start: Map<ItemKey, Required<TransformDef>>;
  pivot: THREE.Vector3;
  mouse0: THREE.Vector2;
  mouse: THREE.Vector2;
  axis: Axis;
  typed: string;
  ctrl: boolean;
}

let st: State | null = null;
const listeners = new Set<() => void>();
import.meta.hot?.accept(() => location.reload());

export const modal = {
  get active() {
    return !!st;
  },
  hint: '',
  /** Time of the last confirm or cancel (performance.now) */
  endedAt: 0,
  subscribe(f: () => void) {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};

const notify = () => listeners.forEach((f) => f());

function canvasPoint(e: { clientX: number; clientY: number }) {
  const r = viewport.canvas!.getBoundingClientRect();
  return new THREE.Vector2(e.clientX - r.left, e.clientY - r.top);
}

function toScreen(p: THREE.Vector3) {
  const cam = viewport.view!;
  const r = viewport.canvas!.getBoundingClientRect();
  const v = p.clone().project(cam);
  return new THREE.Vector2(((v.x + 1) / 2) * r.width, ((1 - v.y) / 2) * r.height);
}

function rayAt(px: THREE.Vector2) {
  const cam = viewport.view!;
  const r = viewport.canvas!.getBoundingClientRect();
  const ndc = new THREE.Vector2((px.x / r.width) * 2 - 1, -(px.y / r.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, cam);
  return ray.ray;
}

/** Point on the axis line closest to the mouse ray (as distance along the axis) */
function axisParam(origin: THREE.Vector3, dir: THREE.Vector3, px: THREE.Vector2) {
  const ray = rayAt(px);
  const w0 = origin.clone().sub(ray.origin);
  const a = dir.dot(dir);
  const b = dir.dot(ray.direction);
  const c = ray.direction.dot(ray.direction);
  const d = dir.dot(w0);
  const e = ray.direction.dot(w0);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-8) return 0;
  return (b * e - c * d) / den;
}

function snapTo(v: number, step: number) {
  return Math.round(v / step) * step;
}

function compute(): Map<ItemKey, TransformDef> {
  const s = st!;
  const out = new Map<ItemKey, TransformDef>();
  const typed = s.typed !== '' && s.typed !== '-' ? Number(s.typed) : null;
  const cam = viewport.view!;

  if (s.mode === 'G') {
    const delta = new THREE.Vector3();
    if (s.axis || typed !== null) {
      const dir = AXES[s.axis ?? 'x'];
      let t = typed !== null ? typed : axisParam(s.pivot, dir, s.mouse) - axisParam(s.pivot, dir, s.mouse0);
      if (s.ctrl && typed === null) t = snapTo(t, 0.1);
      delta.copy(dir).multiplyScalar(t);
    } else {
      // Move on a plane parallel to the view
      const ndc0 = s.pivot.clone().project(cam);
      const r = viewport.canvas!.getBoundingClientRect();
      const dx = ((s.mouse.x - s.mouse0.x) / r.width) * 2;
      const dy = (-(s.mouse.y - s.mouse0.y) / r.height) * 2;
      const p1 = new THREE.Vector3(ndc0.x + dx, ndc0.y + dy, ndc0.z).unproject(cam);
      delta.subVectors(p1, s.pivot);
      if (s.ctrl) delta.set(snapTo(delta.x, 0.1), snapTo(delta.y, 0.1), snapTo(delta.z, 0.1));
    }
    for (const [k, t0] of s.start) out.set(k, { position: [t0.position[0] + delta.x, t0.position[1] + delta.y, t0.position[2] + delta.z] });
  }

  if (s.mode === 'R') {
    const c = toScreen(s.pivot);
    const a0 = Math.atan2(s.mouse0.y - c.y, s.mouse0.x - c.x);
    const a1 = Math.atan2(s.mouse.y - c.y, s.mouse.x - c.x);
    const toCam = cam.position.clone().sub(s.pivot).normalize();
    const axis = s.axis ? AXES[s.axis].clone() : toCam.clone();
    // Rotating clockwise on screen rotates clockwise as seen from the viewer
    let angle = -(a1 - a0);
    if (s.axis && axis.dot(toCam) < 0) angle = -angle;
    if (typed !== null) angle = typed * D2R;
    else if (s.ctrl) angle = snapTo(angle, 5 * D2R);
    const qd = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    for (const [k, t0] of s.start) {
      const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(t0.rotation[0] * D2R, t0.rotation[1] * D2R, t0.rotation[2] * D2R, 'XYZ'));
      const e = new THREE.Euler().setFromQuaternion(qd.clone().multiply(q0), 'XYZ');
      const p = new THREE.Vector3(...t0.position).sub(s.pivot).applyQuaternion(qd).add(s.pivot);
      out.set(k, { rotation: [e.x * R2D, e.y * R2D, e.z * R2D], position: s.start.size > 1 ? [p.x, p.y, p.z] : undefined });
    }
  }

  if (s.mode === 'S') {
    const c = toScreen(s.pivot);
    const d0 = Math.max(4, s.mouse0.distanceTo(c));
    let f = typed !== null ? typed : s.mouse.distanceTo(c) / d0;
    if (s.ctrl && typed === null) f = snapTo(f, 0.1);
    for (const [k, t0] of s.start) {
      const sc: Vec3 = [...t0.scale];
      if (s.axis) sc[{ x: 0, y: 1, z: 2 }[s.axis]] *= f;
      else for (let i = 0; i < 3; i++) sc[i] *= f;
      out.set(k, { scale: sc });
    }
  }
  return out;
}

function apply() {
  const res = compute();
  editLive((d) => {
    for (const [k, t] of res) writeTransform(d, k, t);
  });
  const s = st!;
  const name = { G: 'Translate', R: 'Rotate', S: 'Scale' }[s.mode];
  const ax = s.axis ? `  ${s.axis.toUpperCase()}` : '';
  const val = s.typed ? `  ${s.typed}${s.mode === 'G' ? ' m' : s.mode === 'R' ? '°' : ''}` : '';
  modal.hint = `${name}${ax}${val}`;
  notify();
}

function finish(ok: boolean) {
  if (!st) return;
  if (ok) endGesture();
  else cancelGesture();
  st = null;
  modal.hint = '';
  modal.endedAt = performance.now();
  window.removeEventListener('pointermove', onMove, true);
  window.removeEventListener('pointerdown', onDown, true);
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('keyup', onKeyUp, true);
  window.removeEventListener('contextmenu', onContext, true);
  notify();
}

function onMove(e: PointerEvent) {
  if (!st) return;
  st.mouse = canvasPoint(e);
  st.ctrl = e.ctrlKey;
  apply();
}

function onDown(e: PointerEvent) {
  if (!st) return;
  e.preventDefault();
  e.stopPropagation();
  finish(e.button === 0);
}

function onContext(e: MouseEvent) {
  e.preventDefault();
}

function onKeyUp(e: KeyboardEvent) {
  if (!st) return;
  if (e.key === 'Control') {
    st.ctrl = false;
    apply();
  }
}

function onKey(e: KeyboardEvent) {
  if (!st) return;
  e.preventDefault();
  e.stopPropagation();
  const k = e.key;
  if (k === 'Escape') return finish(false);
  if (k === 'Enter') return finish(true);
  if (k === 'Control') {
    st.ctrl = true;
    return apply();
  }
  const ax = k.toLowerCase();
  if (ax === 'x' || ax === 'y' || ax === 'z') {
    st.axis = st.axis === ax ? null : ax;
    return apply();
  }
  if (/^[0-9.]$/.test(k)) st.typed += k;
  else if (k === '-') st.typed = st.typed.startsWith('-') ? st.typed.slice(1) : '-' + st.typed;
  else if (k === 'Backspace') st.typed = st.typed.slice(0, -1);
  else if ((k === 'g' || k === 'r' || k === 's') && k.toUpperCase() !== st.mode) {
    // Pressing another of G/R/S switches to that operation
    const keys = st.keys;
    const mouse = st.mouse;
    finish(false);
    startModal(k.toUpperCase() as Mode, keys, mouse);
    return;
  }
  apply();
}

export function startModal(mode: Mode, keys: ItemKey[], mouse?: THREE.Vector2) {
  const s = useStudio.getState();
  if (!s.scene || st || !viewport.view || !viewport.canvas) return;
  const start = new Map<ItemKey, Required<TransformDef>>();
  const pivot = new THREE.Vector3();
  let n = 0;
  for (const k of keys) {
    const kind = parseKey(k).kind;
    if ((kind === 'light' || kind === 'empty') && mode !== 'G') continue;
    const t = readTransform(k, s.scene);
    if (!t) continue;
    start.set(k, t);
    const o = itemObject(k);
    if (o) pivot.add(o.getWorldPosition(new THREE.Vector3()));
    else pivot.add(new THREE.Vector3(...t.position));
    n++;
  }
  if (!n) return;
  pivot.divideScalar(n);
  const m = mouse ?? lastMouse.clone();
  st = { mode, keys, start, pivot, mouse0: m.clone(), mouse: m.clone(), axis: null, typed: '', ctrl: false };
  beginGesture();
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('contextmenu', onContext, true);
  apply();
}

/** Remembers the mouse position over the Viewport for when a key is pressed */
const lastMouse = new THREE.Vector2(-1, -1);
export function trackMouse(e: PointerEvent) {
  if (!viewport.canvas) return;
  const p = canvasPoint(e);
  lastMouse.copy(p);
}

/** Keeps G/R/S from starting by key once the mouse has left the Viewport */
export function leaveViewport() {
  lastMouse.set(-1, -1);
}

export function mouseOverViewport() {
  if (!viewport.canvas) return false;
  const r = viewport.canvas.getBoundingClientRect();
  return lastMouse.x >= 0 && lastMouse.y >= 0 && lastMouse.x <= r.width && lastMouse.y <= r.height;
}
