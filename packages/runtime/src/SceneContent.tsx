import { createContext, Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import type {
  ComponentInstanceDef,
  EmptyDef,
  EnvironmentDef,
  LightDef,
  MaterialAssignment,
  ObjectOverride,
  PlacedDef,
  StageSceneDef,
  ToneMappingName,
  TransformDef,
} from './schema';
import { MaterialLibrary } from './materials';
import { useAssetUrl, useStageEnv, VersionsContext } from './context';
import { useGltfAsset } from './assets';
import { PostProcessing } from './PostProcessing';
import { ErrorBoundary } from './ErrorBoundary';
import { defaultParams, registry } from './registry';
import { useRegistry } from './useRegistry';
import { useStageData } from './data';
import { setAnimationClips, setBaseVisible, setEditorHidden, visibilityVersion } from './activation';
import { ObjectFinder } from './cameras';
import { ktx2Loader } from './decoders';
import { SkyBlend, SkyBlendContext, SkyMaps, skyLevel, useSkyBlend } from './sky';
import { ReflectionProbe } from './probe';

const D2R = Math.PI / 180;

/** A top-level object inside a loaded glb. */
export interface AssetObjectInfo {
  /** Object name. */
  name: string;
  /** Names of its original materials. */
  slots: string[];
  /** Triangle count. */
  triangles: number;
}

/** What a loaded glb contains. */
export interface AssetInfo {
  /** Path inside `content/`. */
  path: string;
  /** Its top-level objects. */
  objects: AssetObjectInfo[];
  /** Names of its animation clips. */
  clips: string[];
  /** Total triangle count. */
  triangles: number;
}

/** The three.js objects of what was drawn. Activation Tracks use it to switch visibility, and the studio uses it to attach gizmos and select objects. */
export class SceneHandle {
  /** Top-level objects inside glb assets, by name. */
  objects = new Map<string, THREE.Object3D>();
  /** Placed models, by id. */
  placed = new Map<string, THREE.Object3D>();
  /** Component groups, by id. */
  components = new Map<string, THREE.Object3D>();
  /** Lights, by id. */
  lights = new Map<string, THREE.Light>();
  /** Empties, by id. */
  empties = new Map<string, THREE.Object3D>();
  /** Original glb materials: object name → slot name → material. */
  originals = new Map<string, Map<string, THREE.Material>>();
  /** Loaded glb assets, by path. */
  assets = new Map<string, AssetInfo>();
  /** Increases on every change. */
  version = 0;
  private listeners = new Set<() => void>();
  /** Notifies the subscribers that objects were added or removed. */
  changed() {
    this.version++;
    this.listeners.forEach((f) => f());
  }
  /** Calls `f` on every change. Returns a function that removes the listener. */
  subscribe(f: () => void) {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  }
}

const SceneHandleContext = createContext<SceneHandle | null>(null);

function findObject(h: SceneHandle, name: string): THREE.Object3D | null {
  const named = (m: Map<string, THREE.Object3D>) => [...m.values()].find((o) => o.name === name);
  return h.objects.get(name) ?? named(h.placed) ?? named(h.empties) ?? named(h.components) ?? named(h.lights) ?? null;
}

/**
 * Returns a scene object by name: a top-level object inside a glb (the names under Models in the Hierarchy), a placed model, an Empty, a component or a light.
 * Typically the name comes from a component's `object` parameter (picked with the eyedropper). Returns null until loading finishes, and when not found.
 * Find objects inside it with getObjectByName or traverse on the returned object.
 */
export function useSceneObject(name: string): THREE.Object3D | null {
  const handle = useContext(SceneHandleContext);
  const [obj, setObj] = useState(() => (handle && name ? findObject(handle, name) : null));
  useEffect(() => {
    if (!handle || !name) return void setObj(null);
    const update = () => setObj(findObject(handle, name));
    update();
    return handle.subscribe(update);
  }, [handle, name]);
  return obj;
}

/** The scene's materials. `version` changes whenever the materials are rebuilt. */
const MaterialContext = createContext<{ lib: MaterialLibrary; version: unknown } | null>(null);

/**
 * Returns the three.js material of a scene material (one under Materials in Assets). It is shared by every object it is applied to.
 * Use it to write `color` or `emissiveIntensity` of a built-in material (MeshStandardMaterial, MeshPhysicalMaterial) from data or time inside useFrame.
 * Changing values in the studio rewrites them from the definition, so write them every frame.
 * Returns null when not found, and for create-form shaders (which build a material per object).
 */
export function useSceneMaterial(id: string): THREE.Material | null {
  const ctx = useContext(MaterialContext);
  return useMemo(() => (ctx && id ? (ctx.lib.shared(id) ?? null) : null), [ctx, ctx?.version, id]);
}

/**
 * Applies a scene material (one under Materials in Assets) to a glb a component loaded. It is applied to every mesh inside `object`,
 * and shaders receive each mesh's original material as `base`. When `id` is empty or the hook unmounts, the original materials are restored.
 * Take `id` from a material parameter (`type: 'material'`).
 */
export function useStageMaterial(object: THREE.Object3D | null | undefined, id: string) {
  const ctx = useContext(MaterialContext);
  useLayoutEffect(() => {
    if (!ctx || !object || !id) return;
    const meshes = meshesOf(object);
    const before = meshes.map((m) => [m.material, m.customDepthMaterial] as const);
    const depth = ctx.lib.depth(id);
    for (const mesh of meshes) {
      const pick = (m: THREE.Material) => ctx.lib.get(id, m) ?? m;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(pick) : pick(mesh.material);
      if (depth) mesh.customDepthMaterial = depth;
    }
    return () => {
      meshes.forEach((m, i) => {
        m.material = before[i][0];
        m.customDepthMaterial = before[i][1];
      });
    };
  }, [ctx, object, id]);
}

/** Props of {@link SceneContent}. */
export interface SceneContentProps {
  /** The scene definition to draw. */
  scene: StageSceneDef;
  /** Receives the drawn objects. Created internally when omitted. */
  handle?: SceneHandle;
  /** Objects hidden in the studio (`'object:<name>'`, `'placed:<id>'` and so on). Not saved. */
  hidden?: Set<string>;
  /** A number per path inside `content/` that goes up when the file changes. */
  versions?: Record<string, number>;
}

/** Applies a transform to an object. Omitted fields go back to the values the object had when loaded. */
export function applyTransform(obj: THREE.Object3D, t: TransformDef | undefined) {
  const base = obj.userData.base as { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 } | undefined;
  if (t?.position) obj.position.set(t.position[0], t.position[1], t.position[2]);
  else if (base) obj.position.copy(base.p);
  if (t?.rotation) obj.rotation.set(t.rotation[0] * D2R, t.rotation[1] * D2R, t.rotation[2] * D2R, 'XYZ');
  else if (base) obj.quaternion.copy(base.q);
  if (t?.scale) obj.scale.set(t.scale[0], t.scale[1], t.scale[2]);
  else if (base) obj.scale.copy(base.s);
}

function rememberBase(obj: THREE.Object3D) {
  obj.userData.base = { p: obj.position.clone(), q: obj.quaternion.clone(), s: obj.scale.clone() };
}

function countTriangles(obj: THREE.Object3D) {
  let n = 0;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const g = m.geometry;
    const c = g.index ? g.index.count : g.attributes.position?.count ?? 0;
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
    n += (c / 3) * inst;
  });
  return Math.round(n);
}

function meshesOf(obj: THREE.Object3D) {
  const out: THREE.Mesh[] = [];
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

/** Remembers the original materials on the cloned meshes (to restore them when an assignment is removed). */
function rememberMaterials(root: THREE.Object3D) {
  for (const m of meshesOf(root)) {
    m.userData.originalMaterial = m.material;
    m.userData.originalDepth = m.customDepthMaterial;
  }
}

function applyMaterials(obj: THREE.Object3D, name: string, assignments: MaterialAssignment[], lib: MaterialLibrary) {
  const mine = assignments.filter((a) => a.object === name);
  for (const mesh of meshesOf(obj)) {
    const orig = mesh.userData.originalMaterial as THREE.Material | THREE.Material[];
    const pick = (m: THREE.Material) => {
      const a = mine.find((x) => x.slot === m.name);
      return a ? { mat: lib.get(a.material, m) || m, depth: lib.depth(a.material) } : { mat: m, depth: undefined };
    };
    const picks = Array.isArray(orig) ? orig.map(pick) : [pick(orig)];
    mesh.material = Array.isArray(orig) ? picks.map((p) => p.mat) : picks[0].mat;
    // three.js uses one customDepthMaterial for all of a mesh's slots, so it is set only when every slot agrees;
    // otherwise a slot whose vertex shader moves the geometry casts the original shape.
    const depth = picks.every((p) => p.depth === picks[0].depth) ? picks[0].depth : undefined;
    mesh.customDepthMaterial = depth ?? mesh.userData.originalDepth;
  }
}

function applyShadows(obj: THREE.Object3D, cast: boolean, receive: boolean) {
  for (const m of meshesOf(obj)) {
    m.castShadow = cast;
    m.receiveShadow = receive;
  }
}

function useClonedAsset(path: string) {
  const gltf = useGltfAsset(path);
  const root = useMemo(() => {
    const r = cloneSkinned(gltf.scene) as THREE.Object3D;
    rememberMaterials(r);
    for (const c of r.children) rememberBase(c);
    return r;
  }, [gltf]);
  return { gltf, root };
}

function collectSlots(obj: THREE.Object3D) {
  const slots = new Map<string, THREE.Material>();
  for (const m of meshesOf(obj)) {
    const orig = m.userData.originalMaterial as THREE.Material | THREE.Material[];
    for (const mat of Array.isArray(orig) ? orig : [orig]) if (mat?.name && !slots.has(mat.name)) slots.set(mat.name, mat);
  }
  return slots;
}

function AssetInstance(props: {
  path: string;
  overrides: Record<string, ObjectOverride>;
  assignments: MaterialAssignment[];
  lib: MaterialLibrary;
  libVersion: unknown;
  handle?: SceneHandle;
  hidden?: Set<string>;
}) {
  const { path, overrides, assignments, lib, libVersion, handle, hidden } = props;
  const env = useStageEnv();
  const { gltf, root } = useClonedAsset(path);
  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root]);

  useLayoutEffect(() => {
    if (!handle) return;
    const info: AssetInfo = { path, objects: [], clips: gltf.animations.map((a) => a.name), triangles: countTriangles(root) };
    for (const c of root.children) {
      c.userData.stageItem = { kind: 'object', name: c.name };
      setAnimationClips(c, gltf.animations);
      const slots = collectSlots(c);
      handle.objects.set(c.name, c);
      handle.originals.set(c.name, slots);
      info.objects.push({ name: c.name, slots: [...slots.keys()], triangles: countTriangles(c) });
    }
    handle.assets.set(path, info);
    handle.changed();
    return () => {
      for (const c of root.children) {
        if (handle.objects.get(c.name) === c) {
          handle.objects.delete(c.name);
          handle.originals.delete(c.name);
        }
      }
      handle.assets.delete(path);
      handle.changed();
    };
  }, [root, handle, path, gltf]);

  useLayoutEffect(() => {
    for (const c of root.children) {
      const o = overrides[c.name];
      applyTransform(c, o);
      setBaseVisible(c, o?.visible !== false);
      setEditorHidden(c, !!hidden?.has('object:' + c.name));
      applyShadows(c, o?.castShadow ?? true, o?.receiveShadow ?? true);
    }
  }, [root, overrides, hidden]);

  useLayoutEffect(() => {
    for (const c of root.children) applyMaterials(c, c.name, assignments, lib);
  }, [root, assignments, lib, libVersion]);

  useEffect(() => {
    mixer.stopAllAction();
    if (env.editing) return;
    for (const c of root.children) {
      const o = overrides[c.name];
      if (!o?.clip) continue;
      const clip = gltf.animations.find((a) => a.name === o.clip);
      if (!clip) {
        env.log('warn', `${c.name}: ${path} has no Clip ${o.clip}`, { kind: 'object', name: c.name });
        continue;
      }
      const action = mixer.clipAction(clip, root);
      action.setLoop(o.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = true;
      action.play();
    }
  }, [mixer, root, gltf, overrides, env.editing]);

  useFrame((_, dt) => {
    if (!env.editing) mixer.update(dt);
  });

  return <primitive object={root} />;
}

function PlacedInstance(props: {
  def: PlacedDef;
  assignments: MaterialAssignment[];
  lib: MaterialLibrary;
  libVersion: unknown;
  handle?: SceneHandle;
  hidden?: Set<string>;
}) {
  const { def, assignments, lib, libVersion, handle, hidden } = props;
  const { gltf, root } = useClonedAsset(def.asset);
  const group = useMemo(() => new THREE.Group(), []);

  useLayoutEffect(() => {
    group.add(root);
    setAnimationClips(group, gltf.animations);
    return () => {
      group.remove(root);
    };
  }, [group, root, gltf]);

  useLayoutEffect(() => {
    group.name = def.name;
    group.userData.stageItem = { kind: 'placed', id: def.id };
    handle?.placed.set(def.id, group);
    handle?.originals.set(def.name, collectSlots(root));
    handle?.changed();
    return () => {
      if (handle?.placed.get(def.id) === group) handle.placed.delete(def.id);
      handle?.originals.delete(def.name);
      handle?.changed();
    };
  }, [group, root, def.id, def.name, handle]);

  useLayoutEffect(() => {
    applyTransform(group, def);
    setEditorHidden(group, !!hidden?.has('placed:' + def.id));
    applyShadows(root, def.castShadow ?? true, def.receiveShadow ?? true);
  }, [group, root, def, hidden]);

  useLayoutEffect(() => {
    applyMaterials(root, def.name, assignments, lib);
  }, [root, def.name, assignments, lib, libVersion]);

  // As in AssetInstance, this clip runs independently of the Timeline.
  const env = useStageEnv();
  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root]);
  useEffect(() => {
    mixer.stopAllAction();
    if (env.editing || !def.clip) return;
    const clip = gltf.animations.find((a) => a.name === def.clip);
    if (!clip) {
      env.log('warn', `${def.name}: ${def.asset} has no Clip ${def.clip}`, { kind: 'placed', id: def.id });
      return;
    }
    const action = mixer.clipAction(clip, root);
    action.setLoop(def.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = true;
    action.play();
  }, [mixer, root, gltf, def.clip, def.loop, def.name, def.asset, def.id, env.editing]);
  useEffect(() => () => void mixer.uncacheRoot(root), [mixer, root]);
  useFrame((_, dt) => {
    if (!env.editing && def.clip) mixer.update(dt);
  });

  return <primitive object={group} />;
}

const _v = new THREE.Vector3();

function LightNode({ def, handle, hidden, vsm }: { def: LightDef; handle?: SceneHandle; hidden?: Set<string>; vsm: boolean }) {
  const env = useStageEnv();
  const scene = useThree((s) => s.scene);
  const finder = useMemo(() => new ObjectFinder(scene), [scene]);
  const light = useMemo(() => {
    switch (def.type) {
      case 'directional':
        return new THREE.DirectionalLight();
      case 'spot':
        return new THREE.SpotLight();
      case 'hemisphere':
        return new THREE.HemisphereLight();
      case 'ambient':
        return new THREE.AmbientLight();
      default:
        return new THREE.PointLight();
    }
  }, [def.type]);

  useEffect(() => () => light.dispose(), [light]);
  // Warn once when VSM starts blocking this light's shadow, not on every value change.
  const vsmWarned = useRef(false);

  useLayoutEffect(() => {
    light.name = def.name;
    light.userData.stageItem = { kind: 'light', id: def.id };
    handle?.lights.set(def.id, light);
    handle?.changed();
    return () => {
      if (handle?.lights.get(def.id) === light) handle.lights.delete(def.id);
      handle?.changed();
    };
  }, [light, def.id, def.name, handle]);

  useLayoutEffect(() => {
    light.color.set(def.color);
    light.intensity = def.intensity;
    light.position.set(...def.position);
    setEditorHidden(light, !!hidden?.has('light:' + def.id));
    if (light instanceof THREE.HemisphereLight) light.groundColor.set(def.groundColor ?? '#808080');
    if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) {
      light.distance = def.distance ?? 0;
      light.decay = def.decay ?? 2;
    }
    if (light instanceof THREE.SpotLight) {
      light.angle = (def.angle ?? 30) * D2R;
      light.penumbra = def.penumbra ?? 0.2;
    }
    if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) {
      light.target.position.set(...def.target);
      light.target.updateMatrixWorld();
    }
    if ('shadow' in light && light.shadow) {
      // three.js VSM cannot draw PointLight shadows and warns every frame. Cast no shadow and report it once instead.
      const noVsm = vsm && light instanceof THREE.PointLight && def.castShadow;
      if (noVsm && !vsmWarned.current) env.log('warn', `${def.name}: a Point Light cannot cast shadows when the Shadow Map Type is VSM. Use PCF or Basic`, { kind: 'light', id: def.id });
      vsmWarned.current = noVsm;
      light.castShadow = def.castShadow && !noVsm;
      const s = def.shadow;
      if (s) {
        const size = Math.max(256, Math.round(s.mapSize * env.render.quality[env.settings.quality].shadowMapScale));
        if (light.shadow.mapSize.x !== size) {
          light.shadow.mapSize.set(size, size);
          light.shadow.map?.dispose();
          light.shadow.map = null as any;
        }
        light.shadow.bias = s.bias;
        light.shadow.normalBias = s.normalBias;
        light.shadow.radius = s.radius;
        if (light instanceof THREE.DirectionalLight) {
          const c = light.shadow.camera;
          c.left = -s.cameraSize;
          c.right = s.cameraSize;
          c.top = s.cameraSize;
          c.bottom = -s.cameraSize;
          c.near = 0.5;
          c.far = Math.max(50, new THREE.Vector3(...def.position).distanceTo(new THREE.Vector3(...def.target)) + s.cameraSize * 2);
          c.updateProjectionMatrix();
        }
      }
    }
  }, [light, def, hidden, vsm, env.settings.quality, env.render]);

  // Re-aimed every frame because the target object can move (an Empty with a parent, for example).
  useFrame((state) => {
    if (!def.targetObject || !(light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight)) return;
    const o = finder.get(def.targetObject, state.clock.elapsedTime);
    if (!o) return;
    light.target.position.copy(o.getWorldPosition(_v));
    light.target.updateMatrixWorld();
  });

  return (
    <>
      <primitive object={light} />
      {(light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) && <primitive object={light.target} />}
    </>
  );
}

const TONE: Record<ToneMappingName, THREE.ToneMapping> = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

/** Loads a .hdr or .exr from content/ as an equirect. */
const loadEquirect = async (url: string) => {
  const eq = await (/\.exr($|\?)/i.test(url) ? new EXRLoader() : new HDRLoader()).loadAsync(url);
  eq.mapping = THREE.EquirectangularReflectionMapping;
  return eq;
};

type Sky = { maps: SkyMaps | null; room: THREE.WebGLRenderTarget | null };
const NO_SKY: Sky = { maps: null, room: null };

/**
 * The environment lighting source. The previous sky stays in use until the new one is ready, so the scene doesn't go black while a file reloads.
 * Created inside an effect so that StrictMode's double run never uses a disposed object.
 */
function useSky(def: EnvironmentDef): Sky {
  const gl = useThree((s) => s.gl);
  const env = useStageEnv();
  const hdri = def.source === 'hdri';
  const urlA = useAssetUrl(hdri ? (def.hdri ?? '') : '');
  const urlB = useAssetUrl(hdri ? (def.hdriB ?? '') : '');
  const [sky, setSky] = useState<Sky>(NO_SKY);
  const held = useRef<Sky>(NO_SKY);
  const replace = (next: Sky) => {
    const prev = held.current;
    held.current = next;
    setSky(next);
    prev.maps?.dispose();
    prev.room?.dispose();
  };

  useEffect(() => {
    let cancelled = false;
    if (def.source === 'room') {
      const pm = new THREE.PMREMGenerator(gl);
      const scene = new RoomEnvironment();
      const room = pm.fromScene(scene, 0.04);
      scene.dispose();
      pm.dispose();
      replace({ maps: null, room });
    } else if (!urlA) {
      replace(NO_SKY);
    } else {
      // Wait for both HDRIs; building from A first would rebuild the lighting again when B arrives.
      const warn = (path: string | undefined) => () => {
        if (!cancelled) env.log('warn', `Cannot load HDRI ${path}`, { kind: 'asset', path: path! });
        return null;
      };
      Promise.all([loadEquirect(urlA).catch(warn(def.hdri)), urlB ? loadEquirect(urlB).catch(warn(def.hdriB)) : null]).then(([a, b]) => {
        if (cancelled || !a) {
          a?.dispose();
          b?.dispose();
          if (!cancelled) replace(NO_SKY);
          return;
        }
        replace({ maps: new SkyMaps(gl, a, b), room: null });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [gl, def.source, urlA, urlB]);

  useEffect(
    () => () => {
      held.current.maps?.dispose();
      held.current.room?.dispose();
      held.current = NO_SKY;
    },
    [],
  );
  return sky;
}

/**
 * The reflection probe, or null when `size` is 0. Set the new probe before disposing the old one,
 * so no frame asks a disposed probe to capture (including under StrictMode's double run).
 */
function useProbe(size: number) {
  const gl = useThree((s) => s.gl);
  const [probe, setProbe] = useState<ReflectionProbe | null>(null);
  const held = useRef<ReflectionProbe | null>(null);
  useEffect(() => {
    const prev = held.current;
    const next = size ? new ReflectionProbe(gl, size) : null;
    held.current = next;
    setProbe(next);
    prev?.dispose();
  }, [gl, size]);
  useEffect(
    () => () => {
      held.current?.dispose();
      held.current = null;
    },
    [],
  );
  return probe;
}

function EnvironmentNode({ def, stage, handle, version }: { def: EnvironmentDef; stage: React.RefObject<THREE.Group | null>; handle: SceneHandle; version: unknown }) {
  const { scene, gl } = useThree();
  const { maps, room } = useSky(def);
  const probe = useProbe(def.reflection.enabled && def.source !== 'none' ? def.reflection.resolution : 0);
  const env = useStageEnv();
  const blend = useSkyBlend();
  /** The probe recaptures when the level changes. */
  const sky = useRef<{ tex: THREE.Texture | null; level: number }>({ tex: null, level: -1 });

  /** In the studio's Edit mode, Blend comes from the scene definition; otherwise from code, falling back to the definition. */
  const pick = () => {
    const code = blend.value;
    const v = !env.editing && code !== null && Number.isFinite(code) ? code : def.blend;
    blend.applied = Math.min(1, Math.max(0, v));
    const level = skyLevel(v);
    if (room) return { tex: room.texture, level };
    if (!maps) return { tex: null, level };
    return { tex: maps.get(level), level };
  };
  /**
   * With a probe, scene.environment stays empty until the first capture instead of using the sky:
   * switching from the sky to the probe changes the environment map size, which recompiles every material.
   */
  const apply = () => {
    const s = sky.current.tex;
    const p = probe?.texture ?? null;
    if (def.background.type === 'environment') scene.background = s;
    scene.environment = probe ? p : s;
    // The probe already includes the sky's rotation and intensity at capture time, so they are not applied again.
    scene.environmentRotation.set(0, p ? 0 : def.rotation * D2R, 0);
    scene.environmentIntensity = p ? 1 : def.intensity;
  };

  useLayoutEffect(() => {
    scene.backgroundRotation.set(0, def.rotation * D2R, 0);
    if (def.background.type === 'color') scene.background = new THREE.Color(def.background.color);
    else scene.background = null;
    sky.current = pick();
    apply();
    scene.backgroundBlurriness = def.background.blur;
    scene.backgroundIntensity = def.intensity;
    scene.fog = def.fog.enabled ? new THREE.Fog(def.fog.color, def.fog.near, def.fog.far) : null;
  }, [scene, maps, room, probe, def, env.editing]);

  // Recapture when objects are added or removed or the definition changes. Sky and visibility changes are checked in useFrame.
  useEffect(() => {
    if (!probe) return;
    probe.dirty = true;
    return handle.subscribe(() => void (probe.dirty = true));
  }, [probe, handle, version]);
  const shown = useRef(-1);

  // Runs before the components' useFrame, so a Blend they write takes effect next frame.
  // Don't give it a priority above 0: R3F would stop rendering in scenes without post-processing.
  useFrame(() => {
    const next = pick();
    if (next.tex !== sky.current.tex || next.level !== sky.current.level) {
      sky.current = next;
      if (probe) probe.dirty = true;
      apply();
    }
    if (probe && shown.current !== visibilityVersion()) {
      shown.current = visibilityVersion();
      probe.dirty = true;
    }
    if (probe && stage.current) {
      const done = probe.step(stage.current, { environment: sky.current.tex, rotation: def.rotation * D2R, intensity: def.intensity, fog: scene.fog }, def.reflection.position, performance.now());
      if (done) apply();
    }
  });

  useLayoutEffect(() => {
    gl.toneMapping = TONE[def.toneMapping];
    gl.toneMappingExposure = def.exposure;
    const type = def.shadows.type === 'vsm' ? THREE.VSMShadowMap : def.shadows.type === 'basic' ? THREE.BasicShadowMap : THREE.PCFShadowMap;
    if (gl.shadowMap.enabled !== def.shadows.enabled || gl.shadowMap.type !== type) {
      gl.shadowMap.enabled = def.shadows.enabled;
      gl.shadowMap.type = type;
      gl.shadowMap.needsUpdate = true;
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
      });
    }
  }, [gl, scene, def.toneMapping, def.exposure, def.shadows.enabled, def.shadows.type, env.settings.quality]);

  return null;
}

function ComponentNode({ def, handle, hidden }: { def: ComponentInstanceDef; handle?: SceneHandle; hidden?: Set<string> }) {
  const env = useStageEnv();
  useRegistry();
  const cdef = registry.component(def.type);
  const group = useRef<THREE.Group>(null);
  const params = useMemo(() => defaultParams(cdef, def.params), [cdef, def.params]);
  // Retry a component that stopped on an error when a value or a file in content/ changes.
  const versions = useContext(VersionsContext);
  const retry = useMemo(() => ({}), [params, versions]);

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    g.name = def.name;
    g.userData.stageItem = { kind: 'component', id: def.id };
    handle?.components.set(def.id, g);
    handle?.changed();
    return () => {
      if (handle?.components.get(def.id) === g) handle.components.delete(def.id);
      handle?.changed();
    };
  }, [def.id, def.name, handle, cdef]);

  useLayoutEffect(() => {
    if (group.current) {
      applyTransform(group.current, def);
      setBaseVisible(group.current, def.enabled);
      setEditorHidden(group.current, !!hidden?.has('component:' + def.id));
    }
  }, [def, hidden]);

  useEffect(() => {
    if (!cdef) env.log('warn', `Component ${def.type} is not registered`, { kind: 'component', id: def.id });
  }, [cdef, def.type, def.id]);

  if (!cdef) return null;
  const C = cdef.Component;
  // Turning off Enabled stops the component as well as hiding it (some components move other objects through useSceneObject).
  return (
    <group ref={group}>
      {def.enabled && (
        <ErrorBoundary resetKey={retry} onError={(e) => env.log('error', `${def.name} ${def.type}: ${e.message}`, { kind: 'component', id: def.id })}>
          <Suspense fallback={null}>
            <C id={def.id} name={def.name} params={params} binding={def.binding} editing={env.editing} />
          </Suspense>
        </ErrorBoundary>
      )}
    </group>
  );
}

/**
 * An Empty: a named three.js Object3D with no content. With `parent`, it is placed every frame at that object's position plus `position`
 * (it moves along but does not inherit rotation or scale). Priority -2 moves it before it is read as a camera Target.
 */
function EmptyNode({ def, handle }: { def: EmptyDef; handle?: SceneHandle }) {
  const scene = useThree((s) => s.scene);
  const finder = useMemo(() => new ObjectFinder(scene), [scene]);
  const obj = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    obj.name = def.name;
    obj.userData.stageItem = { kind: 'empty', id: def.id };
    handle?.empties.set(def.id, obj);
    handle?.changed();
    return () => {
      if (handle?.empties.get(def.id) === obj) handle.empties.delete(def.id);
      handle?.changed();
    };
  }, [obj, def.id, def.name, handle]);

  useFrame((state) => {
    obj.position.set(def.position[0], def.position[1], def.position[2]);
    const p = def.parent ? finder.get(def.parent, state.clock.elapsedTime) : null;
    if (p) obj.position.add(p.getWorldPosition(_v));
    obj.updateMatrixWorld();
  }, -2);

  return <primitive object={obj} />;
}

/** Reports shader compile errors to the studio Console as well as the browser console. */
function useShaderErrors() {
  const gl = useThree((s) => s.gl);
  const env = useStageEnv();
  useEffect(() => {
    gl.debug.onShaderError = (ctx, program, vs, fs) => {
      const logs = [ctx.getShaderInfoLog(vs), ctx.getShaderInfoLog(fs), ctx.getProgramInfoLog(program)].map((t) => t?.trim()).filter(Boolean);
      env.log('error', 'Cannot compile shader\n' + logs.join('\n'));
    };
    return () => void (gl.debug.onShaderError = null);
  }, [gl, env]);
}

/**
 * Draws a scene definition inside an R3F Canvas: glb assets, placed models, materials, lights, environment, components, Empties and post-processing.
 * It does not move the camera or apply Timelines; add CameraDirector, ActivationDirector, AnimationDirector and EventDirector for that.
 */
export function SceneContent({ scene, handle: given, hidden, versions }: SceneContentProps) {
  const env = useStageEnv();
  // Keep a handle even when none is given, so components can look up objects with useSceneObject.
  const handle = useMemo(() => given ?? new SceneHandle(), [given]);
  const gl = useThree((s) => s.gl);
  const lib = useMemo(() => new MaterialLibrary(), []);
  useEffect(() => () => lib.dispose(), [lib]);
  const skyBlend = useMemo(() => new SkyBlend(), []);
  // Groups what the runtime draws. The reflection probe captures only this group (so studio helpers don't appear in it).
  const stage = useRef<THREE.Group>(null);
  const basis = env.decoders?.basis;
  lib.textures.ktx2 = () => (basis ? ktx2Loader(gl, basis) : null);
  // A shader can be registered after the scene renders (project code loading later), so materials are rebuilt on registry changes.
  const registryVersion = useRegistry();
  const libVersion = useMemo(() => {
    lib.sync(scene.materials, env.url, env.log);
    return {};
  }, [lib, scene.materials, env.url, env.log, registryVersion]);
  const materials = useMemo(() => ({ lib, version: libVersion }), [lib, libVersion]);
  const data = useStageData();
  useFrame((_, dt) => lib.tick(dt, data.value));
  useShaderErrors();

  return (
    <SceneHandleContext.Provider value={handle}>
      <SkyBlendContext.Provider value={skyBlend}>
      <MaterialContext.Provider value={materials}>
        <VersionsContext.Provider value={versions}>
          {/* Recapture on definition changes only in the studio's Edit mode, so a host app passing a new definition object every render doesn't keep capturing. */}
          <EnvironmentNode def={scene.environment} stage={stage} handle={handle} version={env.editing ? scene : null} />
          <group ref={stage}>
          {scene.lights.map((l) => (
            <LightNode key={l.id} def={l} handle={handle} hidden={hidden} vsm={scene.environment.shadows.enabled && scene.environment.shadows.type === 'vsm'} />
          ))}
          {scene.assets.map((path) => (
            <ErrorBoundary key={path} resetKey={versions?.[path]} onError={() => env.log('warn', `Cannot load ${path}`, { kind: 'asset', path })}>
              <Suspense fallback={null}>
                <AssetInstance path={path} overrides={scene.overrides} assignments={scene.materialAssignments} lib={lib} libVersion={libVersion} handle={handle} hidden={hidden} />
              </Suspense>
            </ErrorBoundary>
          ))}
          {scene.placed.map((p) => (
            <ErrorBoundary key={p.id} resetKey={`${p.asset}?${versions?.[p.asset] ?? ''}`} onError={() => env.log('warn', `${p.name}: cannot load ${p.asset}`, { kind: 'placed', id: p.id })}>
              <Suspense fallback={null}>
                <PlacedInstance def={p} assignments={scene.materialAssignments} lib={lib} libVersion={libVersion} handle={handle} hidden={hidden} />
              </Suspense>
            </ErrorBoundary>
          ))}
          {scene.components.map((c) => (
            <ComponentNode key={c.id} def={c} handle={handle} hidden={hidden} />
          ))}
          {scene.empties.map((e) => (
            <EmptyNode key={e.id} def={e} handle={handle} />
          ))}
          </group>
          <PostProcessing effects={scene.postprocess} />
        </VersionsContext.Provider>
      </MaterialContext.Provider>
      </SkyBlendContext.Provider>
    </SceneHandleContext.Provider>
  );
}
