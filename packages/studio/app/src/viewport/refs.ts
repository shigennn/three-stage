import type * as THREE from 'three';

/** Access to the Viewport camera and view controls from outside the Canvas (key handling, drops) */
export const viewport: {
  /** Camera that holds the view. OrbitControls drives it. The view lives here even in Orthographic */
  camera: THREE.PerspectiveCamera | null;
  /** Camera currently rendering the Viewport. In Orthographic, an OrthographicCamera that follows `camera`. Rays and screen projection use this one */
  view: THREE.Camera | null;
  controls: { target: THREE.Vector3; update: () => void; enabled: boolean } | null;
  canvas: HTMLCanvasElement | null;
  /** Element the stage is drawn in (.viewport-area). This element is what goes fullscreen */
  area: HTMLDivElement | null;
  scene: THREE.Scene | null;
  /** The Edit view, saved on entering Play and restored on returning to Edit */
  editPose: { position: THREE.Vector3; target: THREE.Vector3; fov: number } | null;
} = {
  camera: null,
  view: null,
  controls: null,
  canvas: null,
  area: null,
  scene: null,
  editPose: null,
};

import.meta.hot?.accept(() => location.reload());
