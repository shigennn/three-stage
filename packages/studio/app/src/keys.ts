import * as THREE from 'three';
import { edit, redo, save, select, setPlaying, undo, useStudio } from './store';
import { isTransformable, itemObject } from './items';
import { deleteSelected, duplicateSelected } from './panels/Hierarchy';
import { axisView, currentFrameView } from './viewport/EditorCamera';
import { modal, mouseOverViewport, startModal } from './viewport/modal';
import { viewport } from './viewport/refs';
import { enterFullscreen, isFullscreen } from './viewport/fullscreen';
import { dialogOpen } from './ui/Dialog';

// Shortcuts follow Blender's. The number row also acts as the numpad (like Blender's Emulate Numpad), since many laptops have none.

const NOT_TEXT = new Set(['checkbox', 'radio', 'range', 'color', 'button']);

function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.tagName === 'INPUT') return !NOT_TEXT.has((t as HTMLInputElement).type);
  return t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
}

/** Looks along `dir` around the current pivot and switches to Orthographic, like Blender's Auto Perspective. EditorCamera switches back when the user orbits away */
export function view(dir: THREE.Vector3) {
  const cam = viewport.camera;
  const c = viewport.controls;
  if (!cam || !c) return;
  const d = dir.clone().normalize();
  if (!axisView.dir) axisView.before = useStudio.getState().orthographic;
  axisView.dir = d;
  useStudio.setState({ orthographic: true });
  const dist = cam.position.distanceTo(c.target);
  cam.position.copy(c.target).addScaledVector(d, dist);
  c.update();
}

/** Toggles between PerspectiveCamera and OrthographicCamera. After a manual toggle, orbiting does not switch back */
export function toggleOrthographic() {
  axisView.dir = null;
  useStudio.setState((s) => ({ orthographic: !s.orthographic }));
}

const FRAME_EMPTY_SIZE = new THREE.Vector3(4, 4, 4);

function frameObjects(objs: THREE.Object3D[]) {
  const cam = viewport.camera;
  const c = viewport.controls;
  if (!cam || !c || !objs.length) return;
  const box = new THREE.Box3();
  const b = new THREE.Box3();
  const p = new THREE.Vector3();
  for (const o of objs) {
    b.setFromObject(o);
    // Lights and Empties have no shape, so frame the area around their position
    if (b.isEmpty()) b.setFromCenterAndSize(o.getWorldPosition(p), FRAME_EMPTY_SIZE);
    box.union(b);
  }
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dir = cam.position.clone().sub(c.target).normalize();
  const fov = THREE.MathUtils.degToRad(Math.min(cam.fov, cam.fov * cam.aspect));
  const dist = Math.max(sphere.radius / Math.sin(fov / 2), 1) * 1.15;
  c.target.copy(sphere.center);
  cam.position.copy(sphere.center).addScaledVector(dir, dist);
  c.update();
}

export function frameSelected() {
  const s = useStudio.getState();
  const objs = s.selection.map((k) => itemObject(k)).filter((o): o is THREE.Object3D => !!o);
  frameObjects(objs);
}

export function frameAll() {
  const h = useStudio.getState().handle;
  frameObjects([...h.objects.values(), ...h.placed.values(), ...h.components.values()]);
}

/** Looks through the selected camera (or the first camera). Blender's numpad 0 */
export function viewFromCamera(id?: string) {
  const s = useStudio.getState();
  const sel = id ?? s.selection.find((k) => k.startsWith('camera:'))?.slice(7) ?? s.scene?.cameras[0]?.id;
  if (sel) useStudio.setState({ cameraView: { id: sel, n: Date.now() } });
}

/** Moves the selected camera to the current view. Blender's Align Active Camera to View. If Target points at an object, only position and FOV change */
export function alignCameraToView(id?: string) {
  const s = useStudio.getState();
  const sel = id ?? s.selection.find((k) => k.startsWith('camera:'))?.slice(7) ?? s.cameraView?.id;
  const v = currentFrameView();
  if (!sel || !v) return;
  edit((d) => {
    const c = d.cameras.find((x) => x.id === sel);
    if (!c) return;
    c.position = v.position;
    c.fov = v.fov;
    if (!c.targetObject) c.target = v.target;
  });
}

export function installKeys() {
  // Save works even while typing in a number field. Fields stop keys from propagating, so catch it first in the capture phase
  window.addEventListener(
    'keydown',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || modal.active || dialogOpen() || isFullscreen()) return;
      e.preventDefault();
      e.stopPropagation();
      // A half-typed number is committed when the field loses focus. Commit it, then save
      const el = document.activeElement as HTMLElement | null;
      if (el && el !== document.body) el.blur();
      setTimeout(save, 0);
    },
    true,
  );
  window.addEventListener('keydown', (e) => {
    // In fullscreen, no key does anything, so the view stays as it is (the browser handles Esc to exit)
    if (isFullscreen()) {
      if (e.key !== 'Escape') e.preventDefault();
      return;
    }
    if (modal.active || dialogOpen() || typing(e)) return;
    const s = useStudio.getState();
    const ctrl = e.ctrlKey || e.metaKey;
    const code = e.code;
    const num = (n: string) => code === 'Numpad' + n || code === 'Digit' + n;

    if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (ctrl && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      setPlaying(s.mode === 'edit');
      return;
    }
    if (e.key === 'Escape') {
      if (s.eyedropper) useStudio.setState({ eyedropper: null });
      return;
    }
    if (e.key === 'F11') {
      e.preventDefault();
      enterFullscreen();
      return;
    }
    if (s.mode !== 'edit') return;

    const k = e.key.toLowerCase();
    if (!ctrl && !e.altKey && (k === 'g' || k === 'r' || k === 's') && !e.shiftKey) {
      const keys = s.selection.filter(isTransformable).filter((x) => !s.locked.has(x));
      if (keys.length && mouseOverViewport()) {
        e.preventDefault();
        startModal(k.toUpperCase() as 'G' | 'R' | 'S', keys);
      }
      return;
    }
    if (k === 'd' && e.shiftKey && !ctrl) {
      e.preventDefault();
      const out = duplicateSelected();
      const keys = out.filter(isTransformable);
      if (keys.length && mouseOverViewport()) setTimeout(() => startModal('G', keys), 0);
      return;
    }
    if ((k === 'x' && !ctrl) || e.key === 'Delete') {
      e.preventDefault();
      deleteSelected();
      return;
    }
    if (k === 'h' && !ctrl) {
      e.preventDefault();
      if (e.altKey) useStudio.setState({ hidden: new Set() });
      else {
        const next = new Set(s.hidden);
        s.selection.forEach((x) => next.add(x));
        useStudio.setState({ hidden: next });
      }
      return;
    }
    if (k === 'a' && !ctrl) {
      e.preventDefault();
      if (e.altKey) select([]);
      else {
        const h = s.handle;
        select([...[...h.objects.keys()].map((n) => 'object:' + n), ...[...h.placed.keys()].map((id) => 'placed:' + id)].filter((x) => !s.locked.has(x)));
      }
      return;
    }
    if (e.key === 'F2') {
      e.preventDefault();
      if (s.selection[0]) window.dispatchEvent(new CustomEvent('stage:rename', { detail: s.selection[0] }));
      return;
    }
    // The view keys follow. As in Blender, they only work while the mouse is over the Viewport
    if (!mouseOverViewport()) return;
    if (code === 'NumpadDecimal' || code === 'Period') {
      e.preventDefault();
      frameSelected();
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      frameAll();
      return;
    }
    if (num('0')) {
      e.preventDefault();
      if (ctrl && e.altKey) alignCameraToView();
      else viewFromCamera();
      return;
    }
    if (num('5')) return void toggleOrthographic();
    if (num('1')) return void view(new THREE.Vector3(0, 0, ctrl ? -1 : 1));
    if (num('3')) return void view(new THREE.Vector3(ctrl ? -1 : 1, 0, 0));
    if (num('7')) return void view(new THREE.Vector3(0, ctrl ? -1 : 1, 0.0001));
    if (code === 'NumpadAdd' || code === 'NumpadSubtract') {
      const cam = viewport.camera;
      const c = viewport.controls;
      if (!cam || !c) return;
      const f = code === 'NumpadAdd' ? 0.85 : 1 / 0.85;
      cam.position.sub(c.target).multiplyScalar(f).add(c.target);
      c.update();
    }
  });
}
