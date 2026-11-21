import { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAssetUrl, useStageEnv } from './context';
import { ktx2Loader } from './decoders';

/** What useGLTF returns when given a single URL. */
type GLTF = Extract<ReturnType<typeof useGLTF>, { scene: unknown }>;

// Clearing the useGLTF cache does not free GPU geometry and textures, so users of each URL are counted and the asset is disposed when none remain.
const held = new Map<string, { n: number; gltf: GLTF }>();

/** Disposes the geometry, materials and textures of every mesh under `root`. */
export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (!mat) continue;
      for (const v of Object.values(mat)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
      mat.dispose();
    }
  });
}

/**
 * Loads a .glb inside `content/`. When the file changes it is loaded again and the previous one is freed from the GPU.
 * @param path Path inside `content/`.
 */
export function useGltfAsset(path: string): GLTF {
  const url = useAssetUrl(path);
  const gl = useThree((s) => s.gl);
  const { draco, basis } = useStageEnv().decoders ?? {};
  // Passing true when no decoder path is set makes drei fetch Draco from Google's CDN. Never load from a CDN.
  const gltf = useGLTF(url, draco ?? false, true, (loader) => {
    if (basis) (loader as unknown as { setKTX2Loader(l: unknown): void }).setKTX2Loader(ktx2Loader(gl, basis));
  }) as GLTF;
  useEffect(() => {
    const h = held.get(url);
    if (h) h.n++;
    else held.set(url, { n: 1, gltf });
    return () => {
      const x = held.get(url);
      if (!x || --x.n > 0) return;
      // Another user may pick up the same URL in the same render (switching scenes, for example), so recount on the next tick.
      setTimeout(() => {
        if (x.n > 0 || held.get(url) !== x) return;
        held.delete(url);
        useGLTF.clear(url);
        disposeObject(x.gltf.scene);
      }, 0);
    };
  }, [url, gltf]);
  return gltf;
}
