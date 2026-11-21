import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

// One KTX2Loader per decoder path, never disposed: it owns a Worker and wasm, and three.js warns that creating several is slow.
// It is shared across renderers; detectSupport still runs once per renderer.
const ktx2 = new Map<string, { loader: KTX2Loader; detected: WeakSet<THREE.WebGLRenderer> }>();

export function ktx2Loader(gl: THREE.WebGLRenderer, path: string) {
  let e = ktx2.get(path);
  if (!e) ktx2.set(path, (e = { loader: new KTX2Loader().setTranscoderPath(path), detected: new WeakSet() }));
  if (!e.detected.has(gl)) {
    e.loader.detectSupport(gl);
    e.detected.add(gl);
  }
  return e.loader;
}

export const isKtx2 = (url: string) => /\.ktx2($|[?#])/i.test(url);
