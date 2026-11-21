import { useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { defineComponent, getPath, useActivation, useAssetUrl, useGltfAsset, usePlayback, useReceive, useSceneMaterial, useSceneObject, useSkyBlend, useStageData, useStageMaterial, type StageComponentProps } from '@three-stage/runtime';
import { probe } from '../probe';

type P = { size: number; tint: string; spin: boolean; shape: string; caption: string; model: string; decal: string; follow: string; skin: string; glow: string };

function AllParams({ id, name, params, binding, editing }: StageComponentProps<P>) {
  const store = useStageData();
  const gltf = useGltfAsset(params.model);
  const root = useMemo(() => gltf.scene.clone(), [gltf]);
  useStageMaterial(root, params.skin);
  const target = useSceneObject(params.follow);
  const node = useSceneObject(binding.anchor ?? '');
  const shared = useSceneMaterial(params.glow) as THREE.MeshStandardMaterial | null;
  const decalUrl = useAssetUrl(params.decal);
  const decal = useMemo(() => (decalUrl ? new THREE.TextureLoader().load(decalUrl) : null), [decalUrl]);
  const activation = useActivation();
  const sky = useSkyBlend();
  const playback = usePlayback();
  const [receives, setReceives] = useState(0);
  useReceive(() => setReceives((n) => n + 1));
  useEffect(() => () => decal?.dispose(), [decal]);
  useFrame((_, dt) => {
    sky.value = Number(getPath(store.value, binding.level ?? '') ?? 0) / 100;
    if (params.spin && !editing) root.rotation.y += dt;
    if (shared) shared.emissiveIntensity = 1 + Number(getPath(store.value, binding.level ?? '') ?? 0) / 100;
    probe.allParams = {
      id, name, params: { ...params }, receives,
      level: getPath(store.value, binding.level ?? ''),
      follow: target?.name ?? null, anchor: node?.name ?? null,
      skinApplied: (() => { let n = ''; root.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !n) n = m.type; }); return n; })(),
      sharedGlow: shared?.emissiveIntensity ?? null,
      decalLoaded: !!decal?.image,
      activation: activation.value('component:' + id),
      playbackT: playback.t, cameraId: playback.cameraId, blending: playback.blending,
    };
  });
  return (
    <group scale={params.size}>
      <primitive object={root} />
      <mesh position={[0, 2, 0]}>
        {params.shape === 'sphere' ? <sphereGeometry args={[0.4, 16, 8]} /> : <boxGeometry args={[0.6, 0.6, 0.6]} />}
        <meshStandardMaterial color={params.tint} map={decal} />
      </mesh>
    </group>
  );
}

defineComponent<P>({
  type: 'test.allParams',
  label: 'All Params',
  params: {
    size: { type: 'number', default: 1, min: 0.1, max: 3, step: 0.1, unit: 'x', label: 'Size' },
    tint: { type: 'color', default: '#00BCD4', label: 'Tint' },
    spin: { type: 'boolean', default: true, label: 'Spin' },
    shape: { type: 'select', default: 'box', options: ['box', 'sphere'], label: 'Shape' },
    caption: { type: 'text', default: 'hello', label: 'Caption' },
    model: { type: 'asset', kind: 'glb', default: 'glb/tile.glb', label: 'Model' },
    decal: { type: 'asset', kind: 'texture', srgb: true, default: 'textures/stripes.png', label: 'Decal' },
    follow: { type: 'object', default: 'Crate', label: 'Follow' },
    skin: { type: 'material', default: '', label: 'Skin' },
    glow: { type: 'material', default: '', label: 'Glow' },
  },
  binding: { level: 'data', anchor: 'node' },
  Component: AllParams,
});
