import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { defineComponent, getPath, useSceneObject, useStageData, type StageComponentProps } from '@three-stage/runtime';
import { levelRatio } from '../data';

// Sample of driving objects inside a glb from code: the shapes on the `Accent` material in blocks.glb
// change color from Low Color to High Color as the level rises.

type Params = { target: string; material: string; low: string; high: string };

export function Accent({ params, binding }: StageComponentProps<Params>) {
  const store = useStageData();
  const root = useSceneObject(params.target);
  const materials = useMemo(() => {
    const out = new Set<THREE.MeshStandardMaterial>();
    root?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && m.name === params.material && 'color' in m) out.add(m);
    });
    return [...out];
  }, [root, params.material]);
  const low = useMemo(() => new THREE.Color(params.low), [params.low]);
  const high = useMemo(() => new THREE.Color(params.high), [params.high]);

  // The material is shared with everything else that uses this glb, so restore its color on unmount.
  useEffect(() => {
    const before = materials.map((m) => m.color.clone());
    return () => materials.forEach((m, i) => m.color.copy(before[i]));
  }, [materials]);

  useFrame(() => {
    const level = Number(getPath(store.value, binding.level ?? ''));
    if (!Number.isFinite(level)) return;
    for (const m of materials) m.color.lerpColors(low, high, levelRatio(level));
  });

  return null;
}

defineComponent<Params>({
  type: 'sample.accent',
  label: 'Accent',
  params: {
    target: { type: 'object', default: 'Blocks', label: 'Target' },
    material: { type: 'text', default: 'Accent', label: 'Material Name' },
    low: { type: 'color', default: '#7C8CF8', label: 'Low Color' },
    high: { type: 'color', default: '#F97066', label: 'High Color' },
  },
  binding: { level: 'data' },
  Component: Accent,
});
