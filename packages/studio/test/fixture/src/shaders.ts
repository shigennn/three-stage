import * as THREE from 'three';
import { defineShader } from '@three-stage/runtime';

// Exercises the vertexShader/fragmentShader form.
defineShader({
  type: 'test.wave',
  label: 'Wave',
  params: {
    color: { type: 'color', default: '#3F51B5', label: 'Color' },
    amp: { type: 'number', default: 0.2, min: 0, max: 1, label: 'Amp' },
    stripes: { type: 'asset', kind: 'texture', srgb: true, default: 'textures/stripes.png', label: 'Stripes' },
    mode: { type: 'select', default: 'stripes', options: ['solid', 'stripes'], label: 'Mode' },
    invert: { type: 'boolean', default: false, label: 'Invert' },
  },
  binding: { level: 'data' },
  vertexShader: /* glsl */ `
    uniform float amp; uniform float uTime;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec3 p = position; p.z += sin(uTime * 2.0 + position.x * 3.0) * amp;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color; uniform sampler2D stripes; uniform int mode; uniform bool invert; uniform float level;
    varying vec2 vUv;
    void main() {
      vec3 c = color;
      if (mode == 1) c *= texture2D(stripes, vUv).rgb;
      if (invert) c = 1.0 - c;
      c = mix(c, vec3(1.0, 0.0, 0.0), clamp(level / 100.0, 0.0, 1.0) * 0.5);
      gl_FragColor = vec4(c, 1.0);
    }`,
  options: { side: THREE.DoubleSide },
});

// Exercises the create() form, which returns a three.js material.
defineShader({
  type: 'test.tint',
  label: 'Tint',
  params: { tint: { type: 'color', default: '#FF9800', label: 'Tint' }, amount: { type: 'number', default: 0.5, min: 0, max: 1, label: 'Amount' } },
  uniforms: { pulse: 0 },
  update(u, _data, dt) { u.pulse.value = (u.pulse.value + dt) % 1; },
  create(uniforms, base) {
    const mat = ((base as THREE.MeshStandardMaterial | undefined)?.clone() ?? new THREE.MeshStandardMaterial()) as THREE.MeshStandardMaterial;
    mat.customProgramCacheKey = () => 'test.tint';
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, uniforms);
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 tint; uniform float amount; uniform float pulse;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, tint, amount);');
    };
    return mat;
  },
});
