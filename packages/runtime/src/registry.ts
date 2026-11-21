import type { ComponentType } from 'react';
import type * as THREE from 'three';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { DataStore } from './data';
import { isBuiltinMaterial, isBuiltinMaterialType, isBuiltinPostEffect, type StageSceneDef } from './schema';

// Registry of what the project defines: components, Triggers, shaders, post effects, camera motions, mock data and 2D UI.

/**
 * Definition of one parameter. The studio Inspector shows an input for it, and the value is saved in the scene definition.
 * `label` is the text shown in the studio.
 */
export type ParamDef =
  /** A number. `unit` is shown with the value in the studio. */
  | { type: 'number'; default: number; min?: number; max?: number; step?: number; unit?: string; label?: string }
  /** A color as `#RRGGBB`. */
  | { type: 'color'; default: string; label?: string }
  /** A checkbox. */
  | { type: 'boolean'; default: boolean; label?: string }
  /** One of `options`. */
  | { type: 'select'; default: string; options: string[]; label?: string }
  /** Free text. */
  | { type: 'text'; default: string; label?: string }
  /** A file inside `content/`. Set `srgb` to true for color textures (Map). Data textures such as normals or roughness use false (read as numbers in the shader). */
  | { type: 'asset'; default: string; kind: 'glb' | 'texture'; srgb?: boolean; label?: string }
  /** The name of an object in the scene. Picked with the eyedropper in the studio. */
  | { type: 'object'; default: string; label?: string }
  /** The id of a material in the scene. Picked from the Materials list in the studio. Components apply it to glb files they load, with useStageMaterial. */
  | { type: 'material'; default: string; label?: string };

/** What a binding points at. `data` is a path in the data (such as `items[3].value`); `node` is an object name. */
export type BindingKind = 'data' | 'node';

/** Parameter values by key. */
export type ParamValues = Record<string, any>;

/** Props passed to a registered component. */
export interface StageComponentProps<P extends ParamValues = ParamValues> {
  /** Id of the instance in the scene definition. */
  id: string;
  /** Name of the instance in the scene definition. Use it as a prefix when naming the objects the component lays out, so names don't collide. */
  name: string;
  /** Parameter values, with defaults filled in. */
  params: P;
  /** Binding name → path in the data or object name. */
  binding: Record<string, string>;
  /** True while editing in the studio. Components that should stop their per-frame motion check it. */
  editing: boolean;
}

/** Definition of a component, registered with {@link defineComponent}. */
export interface ComponentDef<P extends ParamValues = ParamValues> {
  /** Unique type name. Prefix it with the project's name. */
  type: string;
  /** Name shown in the studio. */
  label?: string;
  /** Parameters shown in the Inspector. */
  params: Record<string, ParamDef>;
  /** Bindings shown in the Inspector, and what each one points at. */
  binding?: Record<string, BindingKind>;
  /** The R3F component that draws it. */
  Component: ComponentType<StageComponentProps<P>>;
  /** Number of objects the component lays out, shown in the Hierarchy (the 8 in "×8"). */
  count?: (params: P, data: unknown, binding: Record<string, string>) => number;
  /** True if the component gives its objects a Key with setSlotKey. They can then be chosen in an Event Timeline as "the item in the Key's area". */
  slots?: boolean;
}

/** Shader uniforms: one per name in params and binding, plus uTime (seconds; stops while paused). */
export type ShaderUniforms = Record<string, THREE.IUniform>;

/**
 * A material type, registered with {@link defineShader}. It appears under + and Type in the studio's Materials, next to MeshStandardMaterial and MeshPhysicalMaterial.
 * There are two ways to write one. With vertexShader and fragmentShader it becomes a ShaderMaterial (if the vertex shader moves the geometry, shadows follow automatically through the same vertex shader).
 * To receive lights and shadows, return a three.js material from `create` (for example, a MeshStandardMaterial modified with onBeforeCompile).
 */
export interface ShaderDef {
  /** Unique type name. Prefix it with the project's name. */
  type: string;
  /** Name shown in the studio. */
  label?: string;
  /** Parameters. Each becomes a uniform of the same name (colors as THREE.Color, selects as the option's index, textures as THREE.Texture). */
  params: Record<string, ParamDef>;
  /** Data bindings. Each passes a number from the data to the uniform of the same name every frame. */
  binding?: Record<string, 'data'>;
  /** GLSL vertex shader of the ShaderMaterial. */
  vertexShader?: string;
  /** GLSL fragment shader of the ShaderMaterial. */
  fragmentShader?: string;
  /** Other ShaderMaterial settings (transparent, side, and so on). */
  options?: Omit<THREE.ShaderMaterialParameters, 'uniforms' | 'vertexShader' | 'fragmentShader'>;
  /**
   * Creates and returns a material instead of using vertexShader and fragmentShader. Add `uniforms` to shader.uniforms in onBeforeCompile.
   * `base` is the original material (from the glb) of the slot it is assigned to. Modifying base.clone() keeps the original color, textures and emission.
   * Don't modify or return `base` itself (other slots share it). It is undefined when applied where there is no slot.
   * Called once per original material. All of them share `uniforms`.
   */
  create?(uniforms: ShaderUniforms, base?: THREE.Material): THREE.Material;
  /** Uniforms not shown as params, with their initial values. Create here any uniform that update writes (three.js does not send uniforms added later). */
  uniforms?: Record<string, unknown>;
  /** Called every frame after the binding values are written. Use it to put values computed in JavaScript from the data into uniforms (such as a time of day derived from a timestamp). */
  update?(uniforms: ShaderUniforms, data: unknown, dt: number): void;
}

/**
 * A post effect type, registered with {@link definePostEffect}. It appears in Post Processing under Environment in the studio, next to Bloom and Vignette.
 * `stage` selects before tone mapping (`hdr`: like Bloom, colors keep brightness above 1) or after it (`display`: like Vignette, the 0 to 1 colors shown on screen).
 * Within one stage, effects are applied in the order listed in Post Processing.
 */
export interface PostEffectShaderDef {
  /** Unique type name. Prefix it with the project's name. */
  type: string;
  /** Name shown in the studio. */
  label?: string;
  /** Where in the chain the effect runs. */
  stage: 'hdr' | 'display';
  /** Parameters. Each becomes a uniform of the same name (as with shaders). */
  params: Record<string, ParamDef>;
  /** Data bindings (as with shaders). */
  binding?: Record<string, 'data'>;
  /**
   * GLSL applied once over the whole screen. Declare only the uniforms and varyings the runtime provides that you use:
   * tDiffuse (the image so far), vUv, uTime, and uFrame (the output frame: xy is the bottom-left, zw the width and height, with the whole canvas as 0 to 1).
   */
  fragmentShader?: string;
  /** Creates and returns a three.js Pass instead of using fragmentShader (for effects that draw several times, for example). */
  create?(uniforms: ShaderUniforms): Pass;
  /** Uniforms not shown as params, with their initial values (as with shaders). */
  uniforms?: Record<string, unknown>;
  /** Called every frame after the binding values are written (as with shaders). */
  update?(uniforms: ShaderUniforms, data: unknown, dt: number): void;
}

/**
 * A condition that starts an Event Timeline, registered with {@link defineTrigger}.
 * The runtime registers the common ones (List Change); the project registers the rest.
 */
export interface TriggerDef<P extends ParamValues = ParamValues> {
  /** Unique type name. */
  type: string;
  /** Name shown in the studio. */
  label?: string;
  /** Parameters shown in the studio. */
  params: Record<string, ParamDef>;
  /** Compares the previous and current data and returns the Keys of the items something happened to. Not called on the first receive. Return `['']` for events not tied to an item. */
  detect(prev: unknown, next: unknown, params: P): string[];
  /** Keys present in the current data. Offered as choices when playing an Event by hand in the studio. */
  keys?(data: unknown, params: P): string[];
}

/** What a camera motion can read. Objects are looked up by name. */
export interface CameraMotionContext {
  /** Seconds since the start of the Timeline. Does not wrap on loop. Use it for motion that continues across shots, such as a slow sway. */
  time: number;
  /** Seconds since this camera started coming in (from the start of the blend from the previous camera). */
  t: number;
  /** Seconds from when it starts coming in until the move to the next camera ends. */
  length: number;
  /** The pose set on the camera. With targetObject, `target` is that object's position. */
  base: { position: THREE.Vector3; target: THREE.Vector3; fov: number };
  /** The latest data. */
  data: unknown;
  /** Finds an object by name. */
  find(name: string): THREE.Object3D | null;
  /** Objects whose names start with `prefix`, in order of the numbers in their names ("item 2" before "item 10"). */
  findAll(prefix: string): THREE.Object3D[];
}

/**
 * A camera motion, registered with {@link defineCameraMotion}. It appears under Motion on a Camera in the Inspector.
 * The runtime registers the common ones (Drift); the project registers the rest.
 * Derive the pose only from time, t, the data and object positions, and carry nothing over from the previous frame.
 * During a blend, both the previous and next cameras are evaluated every frame and mixed, so the image is the same wherever you look at the Timeline from.
 */
export interface CameraMotionDef<P extends ParamValues = ParamValues> {
  /** Unique type name. */
  type: string;
  /** Name shown in the studio. */
  label?: string;
  /** Parameters shown in the Inspector. */
  params: Record<string, ParamDef>;
  /** `out` arrives as a copy of `base`. Modify it to set this frame's camera. */
  apply(out: { position: THREE.Vector3; target: THREE.Vector3; fov: number }, ctx: CameraMotionContext, params: P): void;
}

/** Mock data for previewing in the studio, registered with {@link defineMockData}. */
export interface MockDataDef {
  /** Label of the variant selector in the studio. */
  variantLabel: string;
  /** Selectable variants of the mock data. */
  variants: { id: string; label: string }[];
  /** Given minutes since midnight, returns the value received by that time and when it was received (in minutes). */
  sample(minutes: number, variant: string): { value: unknown; receivedAt: number };
  /** A summary of the received value, shown in the studio Console. */
  summary?(value: unknown): string;
}

/** Props passed to the 2D UI component. */
export interface OverlayProps {
  /** The data store. Read `.value` for the latest data. */
  data: DataStore;
}

/** The project's 2D UI, registered with {@link defineOverlay}. */
export interface OverlayDef {
  /** The 2D UI drawn on the stage (1080 px high; the width follows the aspect ratio). */
  Component: ComponentType<OverlayProps>;
  /** Names of the parts handed to Activation Tracks with useActivationRef. The studio Timeline offers these as targets. */
  parts?: string[];
}

const components = new Map<string, ComponentDef<any>>();
const triggers = new Map<string, TriggerDef<any>>();
const shaders = new Map<string, ShaderDef>();
const postEffects = new Map<string, PostEffectShaderDef>();
const cameraMotions = new Map<string, CameraMotionDef<any>>();
const listeners = new Set<() => void>();
let mock: MockDataDef | null = null;
let overlay: OverlayDef | null = null;

const notify = () => listeners.forEach((f) => f());

/** Registers a component. Registering the same type again replaces it (as on hot reload). */
export function defineComponent<P extends ParamValues>(def: ComponentDef<P>): ComponentDef<P> {
  components.set(def.type, def);
  notify();
  return def;
}

/** Registers a Trigger. Registering the same type again replaces it. */
export function defineTrigger<P extends ParamValues>(def: TriggerDef<P>): TriggerDef<P> {
  triggers.set(def.type, def);
  notify();
  return def;
}

/** Registers a shader material type. A type named like a built-in material is rejected with a console error. */
export function defineShader(def: ShaderDef): ShaderDef {
  // Built-in names are read as built-in materials from the scene definition, so a registration under one would never be used.
  if (isBuiltinMaterialType(def.type)) {
    console.error(`Shader type ${def.type} is not registered: the name matches a built-in material. Prefix it with the project's name`);
    return def;
  }
  shaders.set(def.type, def);
  notify();
  return def;
}

/** Registers a post effect type. A type named like a built-in post effect is rejected with a console error. */
export function definePostEffect(def: PostEffectShaderDef): PostEffectShaderDef {
  if (isBuiltinPostEffect(def.type)) {
    console.error(`Post effect type ${def.type} is not registered: the name matches a built-in post effect. Prefix it with the project's name`);
    return def;
  }
  postEffects.set(def.type, def);
  notify();
  return def;
}

/** Registers a camera motion. Registering the same type again replaces it. */
export function defineCameraMotion<P extends ParamValues>(def: CameraMotionDef<P>): CameraMotionDef<P> {
  cameraMotions.set(def.type, def);
  notify();
  return def;
}

/** Registers the mock data used in the studio. Only one can be registered; a later call replaces it. */
export function defineMockData(def: MockDataDef): MockDataDef {
  mock = def;
  notify();
  return def;
}

/** Registers the 2D UI. Only one can be registered; a later call replaces it. */
export function defineOverlay(def: OverlayDef): OverlayDef {
  overlay = def;
  notify();
  return def;
}

/** Looks up what has been registered. `subscribe` notifies on every registration and returns an unsubscribe function. */
export const registry = {
  component: (type: string) => components.get(type),
  components: () => [...components.values()],
  trigger: (type: string) => triggers.get(type),
  triggers: () => [...triggers.values()],
  shader: (type: string) => shaders.get(type),
  shaders: () => [...shaders.values()],
  postEffect: (type: string) => postEffects.get(type),
  postEffects: () => [...postEffects.values()],
  cameraMotion: (type: string) => cameraMotions.get(type),
  cameraMotions: () => [...cameraMotions.values()],
  mock: () => mock,
  overlay: () => overlay,
  subscribe(f: () => void) {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};

/**
 * Returns a message for each type the scene refers to by name that is not registered. A bundle contains only the names,
 * so a typo or a removed type would render pink or not at all in the exported component.
 * Publish stops when this is not empty.
 */
export function missingRegistrations(scene: StageSceneDef): string[] {
  return [
    ...Object.values(scene.materials)
      .filter((m) => !isBuiltinMaterial(m) && !shaders.has(m.type))
      .map((m) => `Material ${m.name}: shader ${m.type} is not registered`),
    ...scene.postprocess.filter((p) => !isBuiltinPostEffect(p.type) && !postEffects.has(p.type)).map((p) => `Post effect ${p.type} is not registered`),
    ...scene.components.filter((c) => !components.has(c.type)).map((c) => `Component ${c.name}: ${c.type} is not registered`),
    ...scene.timelines
      .filter((t) => t.trigger.type !== 'none' && !triggers.has(t.trigger.type))
      .map((t) => `Event ${t.name}: Trigger ${t.trigger.type} is not registered`),
    ...scene.cameras.filter((c) => c.motion && !cameraMotions.has(c.motion.type)).map((c) => `Camera ${c.name}: Motion ${c.motion!.type} is not registered`),
  ];
}

/** Returns the files in `content/` that registered types' parameters (`type: 'asset'`) point at, including defaults not written in the scene definition. */
export function assetParamPaths(scene: StageSceneDef): { path: string; owner: string }[] {
  const out: { path: string; owner: string }[] = [];
  const add = (def: { params: Record<string, ParamDef> } | undefined, params: Record<string, unknown>, owner: string) => {
    if (!def) return;
    const v = defaultParams(def, params);
    for (const [k, p] of Object.entries(def.params)) if (p.type === 'asset' && typeof v[k] === 'string' && v[k]) out.push({ path: v[k], owner: `${owner}, ${p.label ?? k}` });
  };
  for (const m of Object.values(scene.materials)) if (!isBuiltinMaterial(m)) add(shaders.get(m.type), m.params, `Material ${m.name}`);
  for (const p of scene.postprocess) if (!isBuiltinPostEffect(p.type)) add(postEffects.get(p.type), p.params, `Post effect ${p.type}`);
  for (const c of scene.components) add(components.get(c.type), c.params, `Component ${c.name}`);
  for (const c of scene.cameras) if (c.motion) add(cameraMotions.get(c.motion.type), c.motion.params, `Camera ${c.name}`);
  return out;
}

/**
 * Checks a scene before Publish. `hasFile` tells whether a path inside `content/` exists.
 * `assets` lists the files parameters point at. Defaults don't appear in the scene definition's text, so these are handed to Publish to include in the bundle.
 */
export function publishCheck(scene: StageSceneDef, hasFile: (path: string) => boolean): { missing: string[]; assets: string[] } {
  const params = assetParamPaths(scene);
  return {
    missing: [...missingRegistrations(scene), ...params.filter((a) => !hasFile(a.path)).map((a) => `${a.owner}: content/${a.path} does not exist`)],
    assets: [...new Set(params.map((a) => a.path))],
  };
}

/** Returns the parameter values with defaults from `def` filled in. Values for keys `def` doesn't define are kept. */
export function defaultParams(def: { params: Record<string, ParamDef> } | undefined, params: Record<string, unknown>): ParamValues {
  const out: ParamValues = {};
  if (def) for (const [k, p] of Object.entries(def.params)) out[k] = params[k] !== undefined ? params[k] : p.default;
  for (const [k, v] of Object.entries(params)) if (!(k in out)) out[k] = v;
  return out;
}
