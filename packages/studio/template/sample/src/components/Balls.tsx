import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { defineComponent, getPath, useGltfAsset, useStageData, type StageComponentProps } from '@three-stage/runtime';

// Sample of a component: balls that wander over the floor and bounce, faster as the level rises.
// The shape comes from a glb (Model); the motion is code.
// Each ball's phase accumulates speed × elapsed time. Multiplying time by speed instead would make the balls jump when the speed changes.

type Params = { model: string; count: number; area: number; height: number; scale: number };

const COLORS = ['#F97066', '#FDB022', '#32D583', '#36BFFA', '#9E77ED', '#F670C7'];

export function Balls({ params, binding, editing }: StageComponentProps<Params>) {
  const store = useStageData();
  const gltf = useGltfAsset(params.model);
  const balls = useMemo(
    () =>
      Array.from({ length: Math.max(1, Math.round(params.count)) }, (_, i) => {
        const o = gltf.scene.clone();
        o.traverse((c) => {
          c.castShadow = c.receiveShadow = true;
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            // Clone so each ball can have its own color without changing the shared glb material.
            const material = (m.material as THREE.MeshStandardMaterial).clone();
            material.color.set(COLORS[i % COLORS.length]);
            m.material = material;
          }
        });
        return o;
      }),
    [gltf, params.count],
  );
  const state = useRef({ phase: 0, speed: 0 });

  useFrame((_, dt) => {
    const s = state.current;
    const target = (Number(getPath(store.value, binding.level ?? '')) || 0) / 100;
    s.speed += (target - s.speed) * Math.min(1, dt * 0.8);
    if (!editing) s.phase += (0.2 + s.speed) * params.scale * dt;
    balls.forEach((o, i) => {
      const p = s.phase + i * 1.7;
      const x = Math.sin(p * 0.37 + i) * 0.6 + Math.sin(p * 0.21 + i * 2.3) * 0.4;
      const z = Math.cos(p * 0.29 + i * 1.1) * 0.6 + Math.sin(p * 0.43 + i * 0.7) * 0.4;
      const bounce = Math.abs(Math.sin(p * 2.2 + i));
      o.position.set(x * params.area, bounce * params.height, z * params.area);
    });
  });

  return (
    <>
      {balls.map((o) => (
        <primitive key={o.uuid} object={o} />
      ))}
    </>
  );
}

defineComponent<Params>({
  type: 'sample.balls',
  label: 'Balls',
  params: {
    model: { type: 'asset', default: 'glb/ball.glb', kind: 'glb', label: 'Model' },
    count: { type: 'number', default: 6, min: 1, max: 24, step: 1, label: 'Count' },
    area: { type: 'number', default: 7, min: 1, max: 25, step: 0.1, unit: 'm', label: 'Area' },
    height: { type: 'number', default: 1.6, min: 0, max: 6, step: 0.1, unit: 'm', label: 'Bounce Height' },
    scale: { type: 'number', default: 1, min: 0, max: 4, step: 0.01, label: 'Speed Scale' },
  },
  binding: { level: 'data' },
  Component: Balls,
});
