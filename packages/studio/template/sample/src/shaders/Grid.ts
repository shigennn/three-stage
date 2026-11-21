import * as THREE from 'three';
import { defineShader } from '@three-stage/runtime';

// Sample of a shader: grid lines on the floor whose color follows the level, with a ripple moving outward when the level is high.
// The floor should still receive light and shadows, so this extends MeshStandardMaterial (`create`) instead of writing
// vertexShader and fragmentShader from scratch.
// Names in params and binding become uniforms of the same name. The runtime passes uTime in seconds.

const VERTEX_HEAD = /* glsl */ `
varying vec2 vGridPos;
`;

const VERTEX_BODY = /* glsl */ `
vGridPos = (modelMatrix * vec4(transformed, 1.0)).xz;
`;

const FRAGMENT_HEAD = /* glsl */ `
varying vec2 vGridPos;
uniform vec3 lowColor;
uniform vec3 highColor;
uniform float spacing;
uniform float width;
uniform float level;
uniform float uTime;
`;

// fwidth takes the varying itself: on Direct3D, fwidth of an expression with a uniform makes the shader compiler
// warn X3595 (partial derivatives may be undefined).
const FRAGMENT_BODY = /* glsl */ `
vec2 cell = abs(fract(vGridPos / spacing - 0.5) - 0.5) / (fwidth(vGridPos) / spacing);
float line = 1.0 - clamp(min(cell.x, cell.y) - width, 0.0, 1.0);
float k = clamp(level / 100.0, 0.0, 1.0);
float ripple = 0.5 + 0.5 * sin(length(vGridPos) * 0.6 - uTime * 3.0);
vec3 lineColor = mix(lowColor, highColor, k);
diffuseColor.rgb = mix(diffuseColor.rgb, lineColor, line * (0.5 + 0.5 * k * ripple));
`;

defineShader({
  type: 'sample.grid',
  label: 'Grid',
  params: {
    lowColor: { type: 'color', default: '#D0D5DD', label: 'Low Color' },
    highColor: { type: 'color', default: '#FDB022', label: 'High Color' },
    spacing: { type: 'number', default: 1, min: 0.1, max: 10, step: 0.1, unit: 'm', label: 'Spacing' },
    width: { type: 'number', default: 0.5, min: 0, max: 4, step: 0.1, label: 'Line Width' },
  },
  binding: { level: 'data' },
  create(uniforms, base) {
    const mat = (base as THREE.MeshStandardMaterial | undefined)?.clone() ?? new THREE.MeshStandardMaterial({ roughness: 0.9 });
    // three.js caches programs by the onBeforeCompile source text; a distinct key keeps copies of this function apart.
    mat.customProgramCacheKey = () => 'sample.grid';
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERTEX_HEAD)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERTEX_BODY);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAGMENT_HEAD)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAGMENT_BODY);
    };
    return mat;
  },
});
