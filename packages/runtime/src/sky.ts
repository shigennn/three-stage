import { createContext, useContext } from 'react';
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// Mixes HDRI and HDRI B by Blend for the background and environment lighting.
// Rebuilding PMREM is expensive, so Blend is quantized to SKY_STEPS levels, and both ends are kept once built.

export const SKY_STEPS = 64;

/**
 * The sky Blend (0 to 1) written by components. `null` uses the Blend from the scene definition.
 * While editing in the studio, values written from code are ignored.
 */
export class SkyBlend {
  /** Blend written by a component, or null to use the scene definition. */
  value: number | null = null;
  /** The Blend (0 to 1) currently applied to the sky; while editing, the scene definition's value. Read it to match other things (such as sun intensity) to the sky. */
  applied = 0;
}

export const SkyBlendContext = createContext<SkyBlend>(new SkyBlend());

/**
 * Returns the {@link SkyBlend} to write the sky Blend to. Write 0 to 1 to `.value` inside useFrame.
 * Writing only 0 or 1 switches the sky; values in between mix it.
 */
export function useSkyBlend(): SkyBlend {
  return useContext(SkyBlendContext);
}

export const skyLevel = (v: number) => (Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * SKY_STEPS) : 0);

const MIX_FRAGMENT = /* glsl */ `
uniform sampler2D a;
uniform sampler2D b;
uniform float t;
varying vec2 vUv;
void main() {
  gl_FragColor = mix(texture2D(a, vUv), texture2D(b, vUv), t);
}`;

const MIX_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** Environment lighting (PMREM) of the sky. Without `b`, only `a` is used. get(level) returns the lighting for that level. Takes ownership of `a` and `b` and disposes them in dispose(). */
export class SkyMaps {
  private pm: THREE.PMREMGenerator;
  private ends: [THREE.WebGLRenderTarget | null, THREE.WebGLRenderTarget | null] = [null, null];
  private mixed: THREE.WebGLRenderTarget | null = null;
  private mixedLevel = -1;
  private equirect: THREE.WebGLRenderTarget | null = null;
  private quad: FullScreenQuad | null = null;

  constructor(
    private gl: THREE.WebGLRenderer,
    private a: THREE.Texture,
    private b: THREE.Texture | null,
  ) {
    this.pm = new THREE.PMREMGenerator(gl);
  }

  /** Number of rebuilds. Read by tests and the Profiler. */
  rebuilt = 0;

  get(level: number): THREE.Texture {
    if (!this.b || level <= 0) return this.end(0);
    if (level >= SKY_STEPS) return this.end(1);
    if (level !== this.mixedLevel) {
      this.mix(level / SKY_STEPS);
      this.mixed = this.pm.fromEquirectangular(this.equirect!.texture, this.mixed ?? undefined);
      this.mixedLevel = level;
      this.rebuilt++;
    }
    return this.mixed!.texture;
  }

  private end(i: 0 | 1) {
    const src = i === 0 ? this.a : this.b!;
    if (!this.ends[i]) {
      this.ends[i] = this.pm.fromEquirectangular(src);
      this.rebuilt++;
    }
    return this.ends[i]!.texture;
  }

  /** Mixes the two images into an equirect at the larger of their sizes (up to 2048). */
  private mix(t: number) {
    const a = this.a.image as { width: number; height: number };
    const b = this.b!.image as { width: number; height: number };
    const w = Math.min(2048, Math.max(a.width, b.width));
    if (!this.equirect) {
      this.equirect = new THREE.WebGLRenderTarget(w, Math.max(1, Math.round(w / 2)), { type: THREE.HalfFloatType, depthBuffer: false });
      this.equirect.texture.mapping = THREE.EquirectangularReflectionMapping;
      this.quad = new FullScreenQuad(
        new THREE.ShaderMaterial({ uniforms: { a: { value: this.a }, b: { value: this.b }, t: { value: 0 } }, vertexShader: MIX_VERTEX, fragmentShader: MIX_FRAGMENT, depthTest: false, depthWrite: false }),
      );
    }
    (this.quad!.material as THREE.ShaderMaterial).uniforms.t.value = t;
    const prev = this.gl.getRenderTarget();
    this.gl.setRenderTarget(this.equirect);
    this.quad!.render(this.gl);
    this.gl.setRenderTarget(prev);
  }

  /** Calling get after dispose rebuilds the lighting instead of returning disposed textures. */
  dispose() {
    this.ends.forEach((r) => r?.dispose());
    this.ends = [null, null];
    this.mixed?.dispose();
    this.mixed = null;
    this.mixedLevel = -1;
    this.equirect?.dispose();
    this.equirect = null;
    this.quad?.material.dispose();
    this.quad?.dispose();
    this.quad = null;
    this.pm.dispose();
    this.a.dispose();
    this.b?.dispose();
  }
}
