import { definePostEffect } from '@three-stage/runtime';
import { levelRatio } from '../data';

// Sample of a post effect: tints the image warmer as the level rises. Bright areas keep their color.
// It runs after tone mapping (stage: 'display'), so colors are the 0–1 values shown on screen.
// update() turns the bound level into the `warmth` uniform.

const FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec3 tintColor;
uniform float strength;
uniform float warmth;
varying vec2 vUv;

void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 tinted = mix(c.rgb, l * tintColor * 1.6, 0.35);
  float keep = smoothstep(0.5, 0.9, l);
  gl_FragColor = vec4(mix(c.rgb, mix(tinted, c.rgb, keep), warmth * strength), c.a);
}`;

definePostEffect({
  type: 'sample.tint',
  label: 'Tint',
  stage: 'display',
  params: {
    tintColor: { type: 'color', default: '#FFB37A', label: 'Tint Color' },
    strength: { type: 'number', default: 0.4, min: 0, max: 1, label: 'Strength' },
  },
  binding: { level: 'data' },
  uniforms: { warmth: 0 },
  fragmentShader: FRAGMENT,
  update(u, _data, dt) {
    const level = Number(u.level.value);
    if (!Number.isFinite(level)) return;
    u.warmth.value += (levelRatio(level) - u.warmth.value) * Math.min(1, dt * 2);
  },
});
