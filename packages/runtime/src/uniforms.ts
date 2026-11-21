import * as THREE from 'three';
import { getPath } from './data';
import type { ParamDef, ShaderUniforms } from './registry';

// Uniform handling shared by shaders (defineShader) and post effects (definePostEffect).

export function createUniforms(params: Record<string, ParamDef>, binding: Record<string, string> = {}, extra: Record<string, unknown> = {}): ShaderUniforms {
  const u: ShaderUniforms = { uTime: { value: 0 } };
  for (const [k, v] of Object.entries(extra)) u[k] = { value: v };
  for (const [k, p] of Object.entries(params)) {
    if (p.type === 'color') u[k] = { value: new THREE.Color() };
    else if (p.type === 'number' || p.type === 'boolean' || p.type === 'select' || (p.type === 'asset' && p.kind === 'texture')) u[k] = { value: null };
  }
  for (const k of Object.keys(binding)) u[k] = { value: 0 };
  return u;
}

/** Writes param values into the uniforms. Textures are loaded through `texture` (sRGB for color images). */
export function writeUniforms(
  u: ShaderUniforms,
  params: Record<string, ParamDef>,
  values: Record<string, unknown>,
  texture: (path: string, srgb: boolean) => THREE.Texture | null,
) {
  for (const [k, p] of Object.entries(params)) {
    const x = u[k];
    const v = values[k];
    if (!x) continue;
    switch (p.type) {
      case 'number':
        x.value = Number(v) || 0;
        break;
      case 'boolean':
        x.value = !!v;
        break;
      case 'color':
        (x.value as THREE.Color).set(String(v));
        break;
      case 'select':
        x.value = Math.max(0, p.options.indexOf(String(v)));
        break;
      case 'asset':
        if (p.kind === 'texture') x.value = v ? texture(String(v), !!p.srgb) : null;
        break;
    }
  }
}

/** Runs every frame: advances uTime and writes the values bound to data. While paused, dt is 0, so uTime stops too. */
export function tickUniforms(u: ShaderUniforms, binding: Record<string, string>, data: unknown, dt: number) {
  if (u.uTime) u.uTime.value += dt;
  for (const [k, path] of Object.entries(binding)) {
    const x = u[k];
    if (x) x.value = Number(getPath(data, path)) || 0;
  }
}
