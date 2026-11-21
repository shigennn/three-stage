import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { defineComponent, getPath, setAnimationClips, setDataVisible, setSlotKey, useGltfAsset, useStageData, type StageComponentProps } from '@three-stage/runtime';
import type { Item } from '../data';
import { probe } from '../probe';

type P = { model: string; gap: number };

function Slots({ name, params, binding }: StageComponentProps<P>) {
  const store = useStageData();
  const gltf = useGltfAsset(params.model);
  const pool = useMemo(() => new Map<string, THREE.Object3D>(), [gltf]);
  const group = useMemo(() => new THREE.Group(), []);
  useFrame(() => {
    const items = (getPath(store.value, binding.items ?? '') as Item[] | undefined) ?? [];
    items.forEach((it, i) => {
      let o = pool.get(it.id);
      if (!o) {
        o = cloneSkinned(gltf.scene);
        o.name = `${name} ${i + 1}`;
        setSlotKey(o, it.id);
        setAnimationClips(o, gltf.animations);
        pool.set(it.id, o);
        group.add(o);
      }
      o.position.set(i * params.gap, 0, 0);
      setDataVisible(o, it.active !== false);
    });
    probe.slots = [...pool].map(([k, o]) => ({ key: k, name: o.name, visible: o.visible, y: +o.children[0].position.y.toFixed(2) }));
  });
  return <primitive object={group} />;
}

defineComponent<P>({
  type: 'test.slots',
  label: 'Slots',
  params: {
    model: { type: 'asset', kind: 'glb', default: 'glb/beacon.glb', label: 'Model' },
    gap: { type: 'number', default: 2, min: 0, unit: 'm', label: 'Gap' },
  },
  binding: { items: 'data' },
  slots: true,
  count: (_p, data, b) => ((getPath(data, b.items ?? '') as unknown[]) ?? []).length,
  Component: Slots,
});
