import * as THREE from 'three';

// Reflection probe: captures the sky and what the runtime draws from one point, for reflections and environment lighting.
// It recaptures only when marked dirty, one cube face per frame, so no single frame pays for all 6.

/** Minimum gap between captures (ms). Keeps it from capturing nonstop while the sky Blend keeps moving. */
const MIN_INTERVAL = 500;

/** The sky applied while capturing. The background and environment lighting of the capture scene are set to these values. */
export interface ProbeSky {
  environment: THREE.Texture | null;
  rotation: number;
  intensity: number;
  fog: THREE.Fog | THREE.FogExp2 | null;
}

export class ReflectionProbe {
  private target: THREE.WebGLCubeRenderTarget;
  private camera: THREE.CubeCamera;
  private pm: THREE.PMREMGenerator;
  private out: THREE.WebGLRenderTarget | null = null;
  /** The face being captured (0 to 5), or -1 when not capturing. */
  private face = -1;
  private last = -Infinity;
  private capture = new THREE.Scene();
  /** A recapture is needed. Once set, capturing starts after the minimum gap. */
  dirty = true;
  /** Number of completed captures. Read by tests. */
  baked = 0;

  constructor(
    private gl: THREE.WebGLRenderer,
    size: number,
  ) {
    this.target = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.camera = new THREE.CubeCamera(0.05, 1000, this.target);
    this.pm = new THREE.PMREMGenerator(gl);
    this.capture.matrixWorldAutoUpdate = false;
  }

  /** The captured environment lighting, or null before the first capture. */
  get texture() {
    return this.out?.texture ?? null;
  }

  /**
   * Captures a single face per frame. `stage` is the group holding what the runtime draws (studio helpers are not in it).
   * Returns true when all 6 faces are done and new environment lighting is ready.
   */
  step(stage: THREE.Object3D, sky: ProbeSky, position: THREE.Vector3Tuple, now: number) {
    if (this.face < 0) {
      if (!this.dirty || now - this.last < MIN_INTERVAL) return false;
      this.dirty = false;
      this.face = 0;
      this.camera.position.set(...position);
      this.camera.updateMatrixWorld(true);
      if (this.camera.coordinateSystem !== this.gl.coordinateSystem) {
        this.camera.coordinateSystem = this.gl.coordinateSystem;
        this.camera.updateCoordinateSystem();
      }
    }
    this.render(stage, sky, this.face);
    if (++this.face < 6) return false;
    this.face = -1;
    this.last = now;
    this.out = this.pm.fromCubemap(this.target.texture, this.out ?? undefined);
    this.baked++;
    // Exposed on the texture so tests and developer tools can check that it is not capturing nonstop.
    this.out.texture.userData.probeBakes = this.baked;
    return true;
  }

  private render(stage: THREE.Object3D, sky: ProbeSky, face: number) {
    const gl = this.gl;
    const c = this.capture;
    // Reflections show the sky even when the scene background is a color.
    c.background = sky.environment;
    c.backgroundRotation.set(0, sky.rotation, 0);
    c.backgroundIntensity = sky.intensity;
    c.environment = sky.environment;
    c.environmentRotation.set(0, sky.rotation, 0);
    c.environmentIntensity = sky.intensity;
    c.fog = sky.fog;
    // Assigned to children without add(), so stage keeps the scene as its parent; its matrices are already current from the regular render.
    c.children = [stage];
    const hidden: THREE.Object3D[] = [];
    stage.traverse((o) => {
      if (o.userData.editorOnly && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    });
    const prev = gl.getRenderTarget();
    const prevFace = gl.getActiveCubeFace();
    const prevMip = gl.getActiveMipmapLevel();
    // Reuse the shadows from the previous frame instead of redrawing them for each of the 6 directions.
    const shadows = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    try {
      gl.setRenderTarget(this.target, face);
      gl.render(c, this.camera.children[face] as THREE.Camera);
    } finally {
      gl.shadowMap.autoUpdate = shadows;
      gl.setRenderTarget(prev, prevFace, prevMip);
      for (const o of hidden) o.visible = true;
      c.children = [];
    }
  }

  dispose() {
    this.target.dispose();
    this.out?.dispose();
    this.out = null;
    this.pm.dispose();
  }
}
