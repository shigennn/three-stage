// Writes the Sample project's glb and hdr files (sample/content/) from three.js primitives.
// Run from the repository root after changing a shape or color: node packages/studio/template/make-sample-assets.mjs
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const content = join(dirname(fileURLToPath(import.meta.url)), 'sample', 'content');

// GLTFExporter packs a glb through the browser's FileReader, which Node lacks.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((r) => {
      this.result = r;
      this.onloadend?.();
    });
  }
};

// Material names become the material slot names in the studio's Inspector, and the Sample's code looks some of them up.
const mat = (name, color, o = {}) => new THREE.MeshStandardMaterial({ name, color, roughness: 0.6, ...o });

function mesh(name, geometry, material, position = [0, 0, 0], rotationY = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.position.set(...position);
  m.rotation.y = rotationY;
  return m;
}

function group(name, children) {
  const g = new THREE.Group();
  g.name = name;
  g.add(...children);
  return g;
}

async function writeGlb(path, roots) {
  const glb = await new GLTFExporter().parseAsync(roots, { binary: true });
  mkdirSync(dirname(join(content, path)), { recursive: true });
  writeFileSync(join(content, path), Buffer.from(glb));
}

function ball() {
  return mesh('Ball', new THREE.SphereGeometry(0.5, 48, 32), mat('Ball', '#F2F4F7', { roughness: 0.35 }), [0, 0.5, 0]);
}

// A floor with boxes, cylinders and cones placed irregularly. Shapes on the `Accent` material change color with the data.
function blocks() {
  const block = mat('Block', '#D0D5DD');
  const accent = mat('Accent', '#7C8CF8', { roughness: 0.4 });
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, h) => new THREE.CylinderGeometry(r, r, h, 40);
  const cone = (r, h) => new THREE.ConeGeometry(r, h, 40);
  const shapes = [
    ['Box', box(2.4, 1.2, 1.6), block, [-6.5, 0.6, -4.2], 0.35],
    ['Box', box(1.2, 2.6, 1.2), accent, [-3.1, 1.3, -6.8], 0.9],
    ['Box', box(1, 1, 1), block, [4.8, 0.5, -5.6], 0.2],
    ['Box', box(3, 0.6, 1.4), block, [7.2, 0.3, 1.8], -0.5],
    ['Box', box(0.9, 0.9, 0.9), accent, [-8.1, 0.45, 3.9], 0.6],
    ['Cylinder', cyl(0.7, 1.8), block, [2.2, 0.9, -8.4], 0],
    ['Cylinder', cyl(1.1, 0.5), accent, [-1.6, 0.25, 6.9], 0],
    ['Cylinder', cyl(0.45, 2.8), block, [8.6, 1.4, -3.4], 0],
    ['Cone', cone(0.9, 1.8), accent, [6.1, 0.9, 6.4], 0],
    ['Cone', cone(0.6, 1.2), block, [-5.4, 0.6, 7.6], 0],
  ].map(([name, geometry, material, position, rotationY]) => mesh(name, geometry, material, position, rotationY));
  return [
    mesh('Floor', new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), mat('Floor', '#8A93A3', { roughness: 0.9 })),
    group('Blocks', shapes),
  ];
}

/** Radiance HDR with new-style RLE: per scanline, the four components one after another, runs packed. */
function rgbe(width, height, px) {
  const out = [Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`)];
  for (let y = 0; y < height; y++) {
    const line = [2, 2, width >> 8, width & 255];
    for (let c = 0; c < 4; c++) {
      const v = (x) => px[(y * width + x) * 4 + c];
      for (let x = 0; x < width; ) {
        let run = 1;
        while (x + run < width && run < 127 && v(x + run) === v(x)) run++;
        if (run >= 4) {
          line.push(128 + run, v(x));
          x += run;
          continue;
        }
        let n = 0;
        while (x + n < width && n < 128) {
          let r = 1;
          while (x + n + r < width && r < 4 && v(x + n + r) === v(x + n)) r++;
          if (r >= 4) break;
          n++;
        }
        line.push(n);
        for (let i = 0; i < n; i++) line.push(v(x + i));
        x += n;
      }
    }
    out.push(Buffer.from(line));
  }
  return Buffer.concat(out);
}

/**
 * An equirectangular sky (1024 × 512): a gradient and three soft lights.
 * The cool and warm versions keep the lights in the same places, so blending them (HDRI and HDRI B) changes only the color.
 */
function sky(warm, width = 1024, height = 512) {
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const key = new THREE.Vector3(8, 14, 10).normalize(); // The scene's Key light direction
  const fills = [new THREE.Vector3(-10, 6, 4).normalize(), new THREE.Vector3(2, 5, -12).normalize()];
  const horizon = warm ? [0.95, 0.66, 0.46] : [0.6, 0.7, 0.86];
  const zenith = warm ? [0.3, 0.17, 0.14] : [0.12, 0.18, 0.34];
  const ground = warm ? [0.22, 0.16, 0.13] : [0.13, 0.14, 0.17];
  const light = warm ? [1.0, 0.84, 0.66] : [0.88, 0.93, 1.0];
  const px = Buffer.alloc(width * height * 4);
  const dir = new THREE.Vector3();
  const soft = (d, size) => {
    const t = Math.min(1, Math.max(0, (dir.dot(d) - Math.cos(size)) / (1 - Math.cos(size))));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < height; y++) {
    const lat = (0.5 - (y + 0.5) / height) * Math.PI;
    for (let x = 0; x < width; x++) {
      const lon = ((x + 0.5) / width) * Math.PI * 2 - Math.PI;
      dir.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), -Math.cos(lat) * Math.cos(lon));
      let c = lat > 0 ? lerp(horizon, zenith, Math.pow(Math.sin(lat), 0.5)) : lerp(horizon, ground, Math.min(1, -Math.sin(lat) * 5));
      const k = soft(key, 0.16) * 30 + fills.reduce((s, f) => s + soft(f, 0.3) * 3, 0);
      c = c.map((v, i) => v + light[i] * k);
      const m = Math.max(...c);
      const i = (y * width + x) * 4;
      if (m < 1e-6) continue;
      const e = Math.ceil(Math.log2(m) + 1e-9);
      const f = 256 / Math.pow(2, e);
      px[i] = Math.min(255, c[0] * f);
      px[i + 1] = Math.min(255, c[1] * f);
      px[i + 2] = Math.min(255, c[2] * f);
      px[i + 3] = e + 128;
    }
  }
  return rgbe(width, height, px);
}

rmSync(join(content, 'glb'), { recursive: true, force: true });
rmSync(join(content, 'hdr'), { recursive: true, force: true });
await writeGlb('glb/ball.glb', ball());
await writeGlb('glb/blocks.glb', blocks());
mkdirSync(join(content, 'hdr'), { recursive: true });
writeFileSync(join(content, 'hdr', 'sky-cool.hdr'), sky(false));
writeFileSync(join(content, 'hdr', 'sky-warm.hdr'), sky(true));
console.log('Wrote ' + content);
