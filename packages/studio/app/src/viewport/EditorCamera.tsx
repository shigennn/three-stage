import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ObjectFinder, cameraTimeline, canvasFov, evaluateTimeline, frameFov, type MotionAccess } from '@three-stage/runtime';
import { useStudio } from '../store';
import { dataStore } from '../mock';
import { viewport } from './refs';

/** Vertical FOV of the output frame rather than the canvas, so framing inside the frame doesn't change with the canvas aspect ratio */
const editView = { fov: 30 };

/** Aspect ratio of the open scene's output frame */
function frameAspect() {
  const r = useStudio.getState().scene?.render.aspectRatio ?? [16, 9];
  return r[0] / r[1];
}

const _p = new THREE.Vector3();
const _d = new THREE.Vector3();

/** Resolves a Camera's targetObject to the position of that object in the Viewport */
export function resolveTarget(name: string) {
  const o = viewport.scene?.getObjectByName(name);
  return o ? o.getWorldPosition(_p) : null;
}

/** Lets camera motion read the same objects and data as in Play while scrubbing the Timeline */
function motionAccess(): MotionAccess | undefined {
  const scene = viewport.scene;
  if (!scene) return undefined;
  const finder = new ObjectFinder(scene);
  return { data: dataStore.value, find: (name) => scene.getObjectByName(name) ?? null, findAll: (prefix) => finder.all(prefix, 0) };
}

/**
 * State kept while looking along an axis (Blender's Auto Perspective).
 * Looking along an axis switches to Orthographic; orbiting away from it restores the projection used before
 */
export const axisView = { dir: null as THREE.Vector3 | null, before: false };

/** Scale that makes sprites with sizeAttenuation off appear the same size in an OrthographicCamera as in a PerspectiveCamera */
export function spriteScale(camera: THREE.Camera) {
  const o = camera as THREE.OrthographicCamera;
  if (!o.isOrthographicCamera || !viewport.camera) return 1;
  return o.top / o.zoom / Math.tan(THREE.MathUtils.degToRad(viewport.camera.fov) / 2);
}

/** Edit view navigation. As in Blender: middle button orbits, Shift+middle button pans, wheel zooms. Alt+left button also orbits */
export function EditorCamera() {
  const mode = useStudio((s) => s.mode);
  const orthographic = useStudio((s) => s.orthographic && s.mode === 'edit');
  const cameraView = useStudio((s) => s.cameraView);
  const scrubT = useStudio((s) => s.scrubT);
  const aspect = useStudio((s) => (s.scene ? s.scene.render.aspectRatio[0] / s.scene.render.aspectRatio[1] : 16 / 9));
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const setThree = useThree((s) => s.set);
  // The PerspectiveCamera owns the view, and OrbitControls always drives it.
  // drei's OrbitControls is recreated when its camera changes, which loses the pivot, so keep the same camera even in Orthographic
  const persp = useMemo(() => {
    const c = new THREE.PerspectiveCamera(30, 1, 0.1, 4000);
    c.position.set(42, 30, 46);
    return c;
  }, []);
  // A negative near keeps objects closer than the eye from being clipped. manual stops R3F from rewriting left/right to match the canvas size
  const ortho = useMemo(() => Object.assign(new THREE.OrthographicCamera(-1, 1, 1, -1, -4000, 4000), { manual: true }), []);
  const controls = useRef<any>(null);
  const alt = useRef(false);

  useLayoutEffect(() => {
    setThree({ camera: orthographic ? ortho : persp });
  }, [orthographic]);

  useLayoutEffect(() => {
    viewport.camera = persp;
    viewport.view = orthographic ? ortho : persp;
    viewport.canvas = gl.domElement;
    viewport.scene = scene;
    viewport.controls = controls.current;
  });

  const fit = () => {
    persp.fov = canvasFov(editView.fov, size.width, size.height, aspect);
    persp.aspect = size.width / size.height;
    persp.updateProjectionMatrix();
  };

  useEffect(() => {
    if (mode === 'edit') fit();
  }, [size.width, size.height, mode, aspect]);

  // Apply view-change requests once the view controls are connected
  const pending = useRef<{ position: THREE.Vector3; target: THREE.Vector3; fov: number } | null>(null);
  useFrame(() => {
    const o = controls.current;
    if (!o) return;
    const p = pending.current;
    if (p) {
      pending.current = null;
      persp.position.copy(p.position);
      o.target.copy(p.target);
      editView.fov = p.fov;
      fit();
      o.update();
    }
    if (!orthographic) return;
    // Use the width that covers the same area as the PerspectiveCamera at the pivot
    const h = persp.position.distanceTo(o.target) * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2);
    ortho.position.copy(persp.position);
    ortho.quaternion.copy(persp.quaternion);
    ortho.top = h;
    ortho.bottom = -h;
    ortho.left = -h * persp.aspect;
    ortho.right = h * persp.aspect;
    ortho.updateProjectionMatrix();
    ortho.updateMatrixWorld();
  }, -1);

  // Remember the view when entering Play, and restore it when returning to Edit
  useLayoutEffect(() => {
    const o = controls.current;
    if (mode === 'play') {
      if (o) viewport.editPose = { position: persp.position.clone(), target: o.target.clone(), fov: editView.fov };
    } else if (viewport.editPose) {
      pending.current = { ...viewport.editPose };
    }
  }, [mode]);

  // Looking through a camera always uses a PerspectiveCamera, as the exported component does
  const fromCamera = (pose: { position: THREE.Vector3; target: THREE.Vector3; fov: number }) => {
    axisView.dir = null;
    useStudio.setState({ orthographic: false });
    pending.current = pose;
  };

  useEffect(() => {
    if (!cameraView) return;
    const c = useStudio.getState().scene?.cameras.find((x) => x.id === cameraView.id);
    if (!c) return;
    const t = (c.targetObject && resolveTarget(c.targetObject)) || new THREE.Vector3(...c.target);
    fromCamera({ position: new THREE.Vector3(...c.position), target: t.clone(), fov: c.fov });
  }, [cameraView]);

  useEffect(() => {
    const scene = useStudio.getState().scene;
    if (scrubT === null || mode !== 'edit' || !scene) return;
    const pose = evaluateTimeline(cameraTimeline(scene.cameras), scrubT, undefined, resolveTarget, motionAccess());
    if (pose) fromCamera({ position: new THREE.Vector3(...pose.position), target: new THREE.Vector3(...pose.target), fov: pose.fov });
  }, [scrubT]);

  // Orbiting away from an axis view restores the previous projection. Panning and zooming don't change the direction, so they don't restore it
  const onChange = () => {
    const d = axisView.dir;
    if (!d) return;
    persp.getWorldDirection(_d).negate();
    if (_d.angleTo(d) < 1e-3) return;
    axisView.dir = null;
    useStudio.setState({ orthographic: axisView.before });
  };

  useEffect(() => {
    const set = (on: boolean) => {
      if (alt.current === on || !controls.current) return;
      alt.current = on;
      controls.current.mouseButtons.LEFT = on ? THREE.MOUSE.ROTATE : null;
    };
    const down = (e: KeyboardEvent) => e.key === 'Alt' && set(true);
    const up = (e: KeyboardEvent) => e.key === 'Alt' && set(false);
    const blur = () => set(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  return (
    <OrbitControls
      ref={controls}
      camera={persp}
      makeDefault
      enabled={mode === 'edit'}
      enableDamping={false}
      mouseButtons={{ LEFT: null as any, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null as any }}
      zoomSpeed={1.2}
      onChange={onChange}
    />
  );
}

/** Returns the current view with the output frame's field of view (for writing into a camera) */
export function currentFrameView() {
  const cam = viewport.camera;
  const c = viewport.controls;
  if (!cam || !c) return null;
  const el = viewport.canvas;
  const w = el?.clientWidth || 16;
  const h = el?.clientHeight || 9;
  return {
    position: [cam.position.x, cam.position.y, cam.position.z] as [number, number, number],
    target: [c.target.x, c.target.y, c.target.z] as [number, number, number],
    fov: frameFov(cam.fov, w, h, frameAspect()),
  };
}
