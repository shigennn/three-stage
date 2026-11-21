import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { definePostEffect } from '@three-stage/runtime';

// Exercises uFrame: paints the edge of the output frame red while level exceeds 50.
definePostEffect({
  type: 'test.frame',
  label: 'Frame',
  stage: 'display',
  params: { width: { type: 'number', default: 0.03, min: 0, max: 0.2, label: 'Width' } },
  binding: { level: 'data' },
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float width; uniform float level; uniform vec4 uFrame;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 f = (vUv - uFrame.xy) / uFrame.zw;
      bool edge = f.x < width || f.y < width || f.x > 1.0 - width || f.y > 1.0 - width;
      gl_FragColor = (edge && level > 50.0) ? vec4(1.0, 0.0, 0.0, 1.0) : c;
    }`,
});

// Exercises the create() form, which returns a three.js Pass.
definePostEffect({
  type: 'test.corner',
  label: 'Corner',
  stage: 'hdr',
  params: { size: { type: 'number', default: 0.08, min: 0, max: 0.5, label: 'Size' } },
  create(uniforms) {
    // ShaderPass keeps a ShaderMaterial's uniforms (it clones a plain shader's), so runtime writes to uniforms.size reach the shader.
    return new ShaderPass(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, size: uniforms.size },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float size; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = (vUv.x < size && vUv.y > 1.0 - size) ? vec4(0.0, 4.0, 0.0, 1.0) : c; }',
    }));
  },
});
