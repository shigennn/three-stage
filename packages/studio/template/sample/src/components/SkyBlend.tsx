import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { defineComponent, getPath, useSkyBlend, useStageData, type StageComponentProps } from '@three-stage/runtime';
import { levelRatio } from '../data';

// Sample of switching skies: blends the Environment's HDRI (cool) and HDRI B (warm) by the level.
// In Edit mode the Inspector's Blend is shown instead, so the look can be checked without data.

type Params = { from: number; to: number };

export function SkyBlend({ params, binding, editing }: StageComponentProps<Params>) {
  const store = useStageData();
  const blend = useSkyBlend();

  useEffect(
    () => () => {
      blend.value = null;
    },
    [blend],
  );

  useFrame((_, dt) => {
    if (editing) {
      blend.value = null;
      return;
    }
    const level = Number(getPath(store.value, binding.level ?? ''));
    if (!Number.isFinite(level)) return;
    const target = levelRatio(level, params.from, params.to);
    // Ease toward the target so that jumping the time in the Data tab doesn't flash the sky.
    const now = blend.value ?? target;
    blend.value = now + (target - now) * Math.min(1, dt * 2);
  });

  return null;
}

defineComponent<Params>({
  type: 'sample.skyBlend',
  label: 'Sky Blend',
  params: {
    from: { type: 'number', default: 30, min: 0, max: 100, step: 1, label: 'Cool Below' },
    to: { type: 'number', default: 80, min: 0, max: 100, step: 1, label: 'Warm Above' },
  },
  binding: { level: 'data' },
  Component: SkyBlend,
});
