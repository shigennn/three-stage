// Generates the fixture/content/ assets for run.mjs with three.js. Run from the repository root:
// `node packages/studio/test/make-fixture-assets.mjs`. These are checked in rather than generated here:
// - glb/beacon-draco.glb, glb/beacon-meshopt.glb: from beacon.glb with `npx @gltf-transform/cli draco` (and `meshopt`)
// - textures/rough.jpg, textures/metal.jpg: 64x64 horizontal gradient, and an image whose left half is white (JPEG from a browser canvas)
// - fonts/Probe.ttf: DejaVu Sans Bold subset to the characters shown in the 2D UI (CARDLETNOIB) with fonttools' pyftsubset
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { EXRExporter } from 'three/examples/jsm/exporters/EXRExporter.js';
import { KTX2Exporter } from 'three/examples/jsm/exporters/KTX2Exporter.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
const C = join(dirname(fileURLToPath(import.meta.url)), 'fixture', 'content');
globalThis.FileReader ??= class { readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); }); } readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend?.(); }); } };

function png(w, h, f) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x / w, y / h); raw.set(c, y * (w * 4 + 1) + 1 + x * 4); }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const checker = (a, b) => (u, v) => ((Math.floor(u * 8) + Math.floor(v * 8)) % 2 ? a : b);
writeFileSync(`${C}/textures/albedo.png`, png(128, 128, checker([230, 120, 40, 255], [40, 90, 200, 255])));
writeFileSync(`${C}/textures/normal.png`, png(64, 64, (u) => [128 + Math.round(60 * Math.sin(u * 20)), 128, 255, 255]));
writeFileSync(`${C}/textures/ao.png`, png(64, 64, (u, v) => { const g = Math.round(255 * (0.5 + 0.5 * v)); return [g, g, g, 255]; }));
writeFileSync(`${C}/textures/emissive.png`, png(64, 64, checker([255, 255, 0, 255], [0, 0, 0, 255])));
writeFileSync(`${C}/textures/stripes.png`, png(64, 64, (u) => (Math.floor(u * 6) % 2 ? [255, 255, 255, 255] : [20, 20, 20, 255])));
{
  const w = 64, d = new Uint8Array(w * w * 4);
  for (let i = 0; i < w * w; i++) { const x = i % w, y = (i / w) | 0; const on = ((x >> 3) + (y >> 3)) % 2; d.set(on ? [255, 0, 160, 255] : [0, 200, 120, 255], i * 4); }
  const t = new THREE.DataTexture(d, w, w, THREE.RGBAFormat, THREE.UnsignedByteType); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  writeFileSync(`${C}/textures/magenta.ktx2`, await new KTX2Exporter().parse(t));
}
{
  const w = 256, h = 128, d = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const up = y < h / 2; d.set(up ? [1.6, 0.7, 0.3, 1] : [0.35, 0.2, 0.5, 1], (y * w + x) * 4); }
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat, THREE.FloatType); t.needsUpdate = true;
  writeFileSync(`${C}/hdr/dusk.exr`, Buffer.from(await new EXRExporter().parse(t)));
}
{
  const w = 128, h = 64; const out = [Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`)]; const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = y < h / 2 ? [0.5, 0.7, 1.0] : [0.3, 0.5, 0.25]; const m = Math.max(...c); const e = Math.ceil(Math.log2(m) + 1e-9); const f = 256 / 2 ** e; px.set([c[0] * f, c[1] * f, c[2] * f, e + 128], (y * w + x) * 4); }
  out.push(px); writeFileSync(`${C}/hdr/noon.hdr`, Buffer.concat(out));
}

const M = (name, color, o = {}) => new THREE.MeshStandardMaterial({ name, color, roughness: 0.6, ...o });
function mesh(name, geo, mat, p = [0, 0, 0]) { const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(...p); return m; }
function group(name, kids, p = [0, 0, 0]) { const g = new THREE.Group(); g.name = name; g.add(...kids); g.position.set(...p); return g; }
const q = (deg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180).toArray();
async function glb(path, roots, animations = []) {
  const scene = new THREE.Scene(); scene.add(...roots);
  const b = await new GLTFExporter().parseAsync(scene, { binary: true, animations });
  writeFileSync(`${C}/glb/${path}`, Buffer.from(b));
}

// Object, material and clip names are referenced by the fixture scenes and run.mjs; rename them together.
await glb('kit.glb', [
  mesh('Ground', new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), M('GroundMat', '#9AA4B2')),
  mesh('Crate', new THREE.BoxGeometry(2, 2, 2), M('CrateMat', '#FFFFFF'), [-6, 1, 0]),
  mesh('Orb', new THREE.SphereGeometry(1.2, 32, 16), M('OrbMat', '#FFFFFF'), [-2, 1.2, 0]),
  mesh('Panel', new THREE.PlaneGeometry(3, 2, 32, 16), M('PanelMat', '#FFFFFF'), [2, 1.5, -2]),
  mesh('Column', new THREE.CylinderGeometry(0.4, 0.4, 3, 16), M('ColumnMat', '#FFFFFF'), [6, 1.5, 0]),
  mesh('Ghost', new THREE.BoxGeometry(1, 1, 1), M('GhostMat', '#FF0000'), [0, 0.5, 4]),
  group('Fan', [mesh('Blade', new THREE.BoxGeometry(2.4, 0.1, 0.3), M('FanMat', '#333333'))], [-6, 4, -4]),
  group('Bell', [mesh('BellBody', new THREE.ConeGeometry(0.6, 1, 16), M('BellMat', '#C9A227'))], [-3, 4, -4]),
  group('Lift', [mesh('LiftBody', new THREE.BoxGeometry(1.5, 0.3, 1.5), M('LiftMat', '#2E7D32'))], [6, 0.15, 4]),
  mesh('Door', new THREE.BoxGeometry(1.2, 2.4, 0.2), M('DoorMat', '#795548'), [3, 1.2, 4]),
], [
  new THREE.AnimationClip('fanSpin', 1, [new THREE.QuaternionKeyframeTrack('Fan.quaternion', [0, 0.25, 0.5, 0.75, 1], [...q(0), ...q(90), ...q(180), ...q(270), ...q(360)])]),
  new THREE.AnimationClip('ring', 1, [new THREE.VectorKeyframeTrack('Bell.position', [0, 1], [-3, 4, -4, -3, 2, -4])]),
  new THREE.AnimationClip('liftUp', 2, [new THREE.VectorKeyframeTrack('Lift.position', [0, 2], [6, 0.15, 4, 6, 3.15, 4])]),
]);
const beacon = () => group('Beacon', [mesh('Body', new THREE.BoxGeometry(1, 1, 1), M('Body', '#7B3FE4'), [0, 0.5, 0]), mesh('Top', new THREE.ConeGeometry(0.45, 0.8, 16), M('Top', '#F5B700'), [0, 1.4, 0])]);
const beaconClips = [
  new THREE.AnimationClip('spin', 2, [new THREE.QuaternionKeyframeTrack('Beacon.quaternion', [0, 0.5, 1, 1.5, 2], [...q(0), ...q(90), ...q(180), ...q(270), ...q(360)])]),
  new THREE.AnimationClip('rise', 2, [new THREE.VectorKeyframeTrack('Beacon.position', [0, 2], [0, 0, 0, 0, 2, 0])]),
];
await glb('beacon.glb', [beacon()], beaconClips);
await glb('tile.glb', [mesh('Tile', new THREE.BoxGeometry(0.8, 0.2, 0.8), M('TileMat', '#FFFFFF'))]);
console.log('wrote  ' + C);
