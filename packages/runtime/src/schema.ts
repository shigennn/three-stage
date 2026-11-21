// The shape of a scene definition (*.stage.json).

/** The scene definition format version this runtime writes and reads. Files with a newer version are rejected. */
export const SCHEMA_VERSION = 2;

/** A 3D vector as `[x, y, z]`. */
export type Vec3 = [number, number, number];

/** Position, rotation and scale. Omitted fields keep the value the object already has. */
export interface TransformDef {
  /** Position in meters. */
  position?: Vec3;
  /** Degrees, applied in XYZ order. */
  rotation?: Vec3;
  /** Scale factor per axis. */
  scale?: Vec3;
}

/** Changes applied to an object inside a loaded glb, keyed by the object's name. */
export interface ObjectOverride extends TransformDef {
  /** Whether the object is shown. */
  visible?: boolean;
  /** Whether the object casts shadows. */
  castShadow?: boolean;
  /** Whether the object receives shadows. */
  receiveShadow?: boolean;
  /** Name of the animation clip to play. */
  clip?: string;
  /** Whether the clip loops. */
  loop?: boolean;
}

/** A copy of a glb asset placed in the scene. */
export interface PlacedDef extends TransformDef {
  /** Unique id within the scene. */
  id: string;
  /** Display name. */
  name: string;
  /** Path of the glb inside `content/`. */
  asset: string;
  /** Whether the copy casts shadows. */
  castShadow?: boolean;
  /** Whether the copy receives shadows. */
  receiveShadow?: boolean;
  /** Name of the animation clip to play (same as `clip` on an object inside a glb). */
  clip?: string;
  /** Whether the clip loops. */
  loop?: boolean;
}

/** Material types built into the runtime. Types a project registers with defineShader (such as `sample.flow`) can be used as well. */
export type MaterialType = 'standard' | 'physical';

/**
 * A built-in material. Fields map to the three.js properties of the same name on
 * MeshStandardMaterial (`standard`) and MeshPhysicalMaterial (`physical`).
 */
export interface BuiltinMaterialDef {
  /** Display name. */
  name: string;
  /** Which three.js material to build. */
  type: MaterialType;
  /** Base color as `#RRGGBB`. */
  color: string;
  /** 0 is mirror-like, 1 is fully rough. */
  roughness: number;
  /** 0 is dielectric, 1 is metal. */
  metalness: number;
  /** Emissive color as `#RRGGBB`. */
  emissive: string;
  /** Multiplier for the emissive color. */
  emissiveIntensity: number;
  /** 0 to 1. Takes effect only when `transparent` is true. */
  opacity: number;
  /** Whether the material is drawn as transparent. */
  transparent: boolean;
  /** Multiplier for reflections and light from the environment. */
  envMapIntensity: number;
  /** Color texture path inside `content/`. */
  map?: string;
  /** Normal map path inside `content/`. */
  normalMap?: string;
  /** Roughness map path inside `content/`. */
  roughnessMap?: string;
  /** Metalness map path inside `content/`. */
  metalnessMap?: string;
  /** Ambient occlusion map path inside `content/`. */
  aoMap?: string;
  /** Emissive map path inside `content/`. */
  emissiveMap?: string;
  /** `physical` only. */
  clearcoat?: number;
  /** `physical` only. */
  clearcoatRoughness?: number;
  /** `physical` only. */
  transmission?: number;
  /** `physical` only. */
  thickness?: number;
  /** `physical` only. */
  ior?: number;
  /** `physical` only. */
  sheen?: number;
  /** `physical` only. Color as `#RRGGBB`. */
  sheenColor?: string;
}

/** A material using a shader the project registered. `type` is the name of the registered type. */
export interface ShaderMaterialDef {
  /** Display name. */
  name: string;
  /** Name of the type registered with defineShader. */
  type: string;
  /** Values for the shader's params. */
  params: Record<string, unknown>;
  /** Uniform name → path in the data. */
  binding: Record<string, string>;
}

/** Any material in a scene definition. */
export type MaterialDef = BuiltinMaterialDef | ShaderMaterialDef;

/** Returns true when `type` is a material type built into the runtime. */
export function isBuiltinMaterialType(type: string): type is MaterialType {
  return type === 'standard' || type === 'physical';
}

/** Returns true when the material is a built-in one rather than a registered shader. */
export function isBuiltinMaterial(m: MaterialDef): m is BuiltinMaterialDef {
  return isBuiltinMaterialType(m.type);
}

/** Texture slots of a built-in material. */
export const MATERIAL_MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const;
/** One of the texture slots in {@link MATERIAL_MAPS}. */
export type MaterialMapKey = (typeof MATERIAL_MAPS)[number];

/** Replaces one material of an object inside a glb with a material from the scene. */
export interface MaterialAssignment {
  /** Name of the object. */
  object: string;
  /** Name of the original material in the glb. */
  slot: string;
  /** Key of the material in `materials`. */
  material: string;
}

/** Light types, matching the three.js lights of the same name. */
export type LightType = 'directional' | 'point' | 'spot' | 'hemisphere' | 'ambient';

/** Shadow settings of a light. */
export interface ShadowDef {
  /** Width and height of the shadow map in px. */
  mapSize: number;
  /** Depth bias, as `shadow.bias` in three.js. */
  bias: number;
  /** Bias along the normal, as `shadow.normalBias` in three.js. */
  normalBias: number;
  /** Blur radius, as `shadow.radius` in three.js. */
  radius: number;
  /** Half the width (m) of the area a directional light draws shadows in. Sets left, right, top and bottom of shadow.camera. */
  cameraSize: number;
}

/** A light in the scene. */
export interface LightDef {
  /** Unique id within the scene. */
  id: string;
  /** Display name. */
  name: string;
  /** Kind of light. */
  type: LightType;
  /** Color as `#RRGGBB`. */
  color: string;
  /** Brightness, as `intensity` in three.js. */
  intensity: number;
  /** Position in meters. */
  position: Vec3;
  /** Point the light faces (directional and spot). */
  target: Vec3;
  /** Name of an object to face. Takes precedence over `target` when set. */
  targetObject?: string;
  /** `hemisphere` only. Color from below as `#RRGGBB`. */
  groundColor?: string;
  /** `point` and `spot`. Range in meters; 0 means unlimited. */
  distance?: number;
  /** `point` and `spot`. Falloff over distance. */
  decay?: number;
  /** Degrees. As with three.js `angle`, measured from the direction to the edge of the cone. */
  angle?: number;
  /** `spot` only. 0 to 1, softness of the cone's edge. */
  penumbra?: number;
  /** Whether the light casts shadows. */
  castShadow: boolean;
  /** Shadow settings. Defaults apply when omitted. */
  shadow?: ShadowDef;
}

/** Tone mapping names, matching the three.js tone mappings. */
export type ToneMappingName = 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces' | 'agx' | 'neutral';

/** Background, environment lighting, fog, tone mapping and shadows of a scene. */
export interface EnvironmentDef {
  /** What is drawn behind the scene. `blur` applies to the `environment` background. */
  background: { type: 'none' | 'color' | 'environment'; color: string; blur: number };
  /** Where environment lighting comes from. `room` is three.js RoomEnvironment. */
  source: 'none' | 'room' | 'hdri';
  /** Path of the HDRI inside `content/`. */
  hdri?: string;
  /** A second HDRI to switch to from `hdri` (a night sky, for example). Mixed in by `blend`. */
  hdriB?: string;
  /** 0 shows `hdri`, 1 shows `hdriB`, values in between mix them. Components can write it every frame with useSkyBlend. */
  blend: number;
  /** Reflection probe. Captures the surroundings (sky and objects) from `position` and uses them for reflections and environment lighting. `resolution` is the width of one cube face in px. */
  reflection: { enabled: boolean; position: Vec3; resolution: number };
  /** Multiplier for environment lighting. */
  intensity: number;
  /** Rotation around the Y axis (degrees). */
  rotation: number;
  /** Linear fog between `near` and `far` meters. */
  fog: { enabled: boolean; color: string; near: number; far: number };
  /** Tone mapping applied to the final image. */
  toneMapping: ToneMappingName;
  /** Tone mapping exposure. */
  exposure: number;
  /** Shadow rendering for the whole scene. */
  shadows: { enabled: boolean; type: 'pcf' | 'vsm' | 'basic' };
}

/** Post effects built into the runtime. Types a project registers with definePostEffect (such as `sample.dayNight`) can be used as well. */
export type PostEffectType = 'bloom' | 'vignette' | 'fxaa' | 'smaa';

/** One entry in the post-processing stack. */
export interface PostEffectDef {
  /** Unique id within the scene. */
  id: string;
  /** A built-in type, or the name of a registered type. */
  type: PostEffectType | (string & {});
  /** Whether the effect is applied. */
  enabled: boolean;
  /** Built-in types take numbers only. Registered types take the values of their params. */
  params: Record<string, unknown>;
  /** Registered types only. Uniform name → path in the data. */
  binding?: Record<string, string>;
}

/** All built-in post effect types. */
export const BUILTIN_POST_EFFECTS: readonly PostEffectType[] = ['bloom', 'vignette', 'fxaa', 'smaa'];

/** Returns true when `type` is a post effect built into the runtime. */
export function isBuiltinPostEffect(type: string): type is PostEffectType {
  return (BUILTIN_POST_EFFECTS as readonly string[]).includes(type);
}

/** An instance of a component the project registered with defineComponent. */
export interface ComponentInstanceDef extends TransformDef {
  /** Unique id within the scene. */
  id: string;
  /** Display name. */
  name: string;
  /** Name of the registered component type. */
  type: string;
  /** Whether the component is drawn. */
  enabled: boolean;
  /** Values for the component's params. */
  params: Record<string, unknown>;
  /** Links to data. Each value is a path in the data (such as `items[3].value`) or an object name. */
  binding: Record<string, string>;
}

/** A point with no content. Used for 2D UI labels, camera and light targets, and as an anchor for components. */
export interface EmptyDef {
  /** Unique id within the scene. */
  id: string;
  /** Display name. */
  name: string;
  /** With `parent`, the offset from the parent's position (in world orientation). */
  position: Vec3;
  /** Name of an object to move with. Its rotation and scale are not inherited. */
  parent?: string;
}

/** Easing curve names for camera blends. */
export type EasingName = 'linear' | 'easeInOut' | 'easeOut' | 'easeIn';

/** A camera on the Camera Track. Cameras play in order, and the first follows the last. */
export interface CameraDef {
  /** Unique id within the scene. */
  id: string;
  /** Display name. */
  name: string;
  /** Position in meters. */
  position: Vec3;
  /** Point the camera looks at. */
  target: Vec3;
  /** Name of an object to look at. Takes precedence over `target` when set. */
  targetObject?: string;
  /** Vertical field of view (degrees), relative to the output frame (render.aspectRatio). */
  fov: number;
  /** Seconds this camera is on the track. */
  duration: number;
  /** Seconds of blending into the next camera. Overlaps the end of `duration`. */
  blend: number;
  /** Easing curve of the blend. */
  easing: EasingName;
  /** A registered camera motion (defineCameraMotion) and its values. Without it the camera stays still. */
  motion?: { type: string; params: Record<string, unknown> };
}

/** A span on an Activation Track. */
export interface ActivationClipDef {
  /** Unique id within the track. */
  id: string;
  /** Seconds from the start of the Timeline. */
  start: number;
  /** Seconds from the start of the Timeline. */
  end: number;
  /** Seconds of fade-in. Affects 2D UI only; 3D targets are simply shown inside the span. */
  fadeIn: number;
  /** Seconds of fade-out. Affects 2D UI only. */
  fadeOut: number;
}

/**
 * Shows the target only inside its spans. `target` is `'ui:<part name>'`, `'object:<name>'`, `'placed:<id>'`, `'component:<id>'` or `'light:<id>'`.
 * In an Event Timeline, `'slot:<component id>'` is also allowed and points at that component's object in the slot of the Event's Key.
 */
export interface ActivationTrackDef {
  /** Unique id within the Timeline. */
  id: string;
  /** What the track shows and hides. */
  target: string;
  /** Spans in which the target is shown. */
  clips: ActivationClipDef[];
}

/** A span on an Animation Track. Plays an AnimationClip of the target from the clip's start, inside the span. */
export interface AnimationClipDef {
  /** Unique id within the track. */
  id: string;
  /** Seconds from the start of the Timeline. */
  start: number;
  /** Seconds from the start of the Timeline. */
  end: number;
  /** Name of the AnimationClip in the glb. */
  clip: string;
}

/** An Animation Track. `target` takes the same forms as on an Activation Track. */
export interface AnimationTrackDef {
  /** Unique id within the Timeline. */
  id: string;
  /** What the clips play on. */
  target: string;
  /** Spans in which a clip plays. */
  clips: AnimationClipDef[];
}

/** What starts an Event Timeline. `type` is a registered Trigger type (defineTrigger). `'none'` plays only when called directly. */
export interface TimelineTriggerDef {
  /** Name of the registered Trigger type, or `'none'`. */
  type: string;
  /** Values for the Trigger's params. */
  params: Record<string, unknown>;
}

/** A Timeline that plays once when something happens. `name` is the Event's name. */
export interface EventTimelineDef {
  /** Unique id within the scene. */
  id: string;
  /** Event name. */
  name: string;
  /** What starts this Timeline. */
  trigger: TimelineTriggerDef;
  /** Activation Tracks. */
  tracks: ActivationTrackDef[];
  /** Animation Tracks. */
  animations: AnimationTrackDef[];
}

/** One quality level. Selected by `settings.quality` of StageView and by High/Low under Render in the studio. */
export interface QualityDef {
  /** Upper limit of the rendering height (px). */
  maxHeight: number;
  /** Factor applied to each light's shadow mapSize. */
  shadowMapScale: number;
}

/** Rendering settings. Changed in Render Settings in the studio. */
export interface RenderDef {
  /** Aspect ratio of the output frame. The 2D UI stage is 1080 px high and its width follows this ratio. */
  aspectRatio: [number, number];
  /** Settings for each quality level. */
  quality: { high: QualityDef; low: QualityDef };
  /** When frames keep taking longer than frameTimeThreshold (ms), the height drops to minHeight. */
  dynamicResolution: { minHeight: number; frameTimeThreshold: number };
}

/** A whole scene definition, as stored in a *.stage.json file. */
export interface StageSceneDef {
  /** Format version. See {@link SCHEMA_VERSION}. */
  schemaVersion: number;
  /** Scene name. */
  name: string;
  /** Paths of the glb files inside `content/` that are loaded as they are. */
  assets: string[];
  /** Changes to objects inside the glb files, keyed by object name. */
  overrides: Record<string, ObjectOverride>;
  /** Placed copies of glb files. */
  placed: PlacedDef[];
  /** Materials, keyed by id. */
  materials: Record<string, MaterialDef>;
  /** Which materials replace which glb materials. */
  materialAssignments: MaterialAssignment[];
  /** Lights. */
  lights: LightDef[];
  /** Background, environment lighting, fog, tone mapping and shadows. */
  environment: EnvironmentDef;
  /**
   * Post-processing stack. Effects run in a fixed order: bloom, registered `hdr` effects, tone mapping and vignette,
   * registered `display` effects, fxaa, smaa. Registered effects within one stage run in array order.
   */
  postprocess: PostEffectDef[];
  /** Component instances. */
  components: ComponentInstanceDef[];
  /** Empties. */
  empties: EmptyDef[];
  /** Cameras on the Camera Track, in playing order. */
  cameras: CameraDef[];
  /** Activation Tracks of the main Timeline. */
  tracks: ActivationTrackDef[];
  /** Animation Tracks of the main Timeline. Each Clip plays at a fixed time in the loop. */
  animations: AnimationTrackDef[];
  /** Event Timelines. */
  timelines: EventTimelineDef[];
  /** Rendering settings. */
  render: RenderDef;
}

/** Height of the 2D UI stage in px. */
export const STAGE_HEIGHT = 1080;

/** Returns the size (px) of the 2D UI stage. The height is fixed at 1080 and the width follows the aspect ratio. */
export function stageSize(aspectRatio: [number, number]) {
  const [w, h] = aspectRatio;
  return { width: Math.round((STAGE_HEIGHT * w) / h), height: STAGE_HEIGHT };
}

/** Returns the default rendering settings. */
export function defaultRender(): RenderDef {
  return {
    aspectRatio: [16, 9],
    quality: { high: { maxHeight: 1080, shadowMapScale: 1 }, low: { maxHeight: 720, shadowMapScale: 0.5 } },
    dynamicResolution: { minHeight: 720, frameTimeThreshold: 40 },
  };
}

/** Allowed widths (px) of one face of the reflection probe. */
export const PROBE_SIZES = [64, 128, 256];

/** Returns the default environment settings. */
export function defaultEnvironment(): EnvironmentDef {
  return {
    background: { type: 'color', color: '#EEF1F5', blur: 0 },
    source: 'room',
    intensity: 1,
    rotation: 0,
    blend: 0,
    reflection: { enabled: true, position: [0, 1.5, 0], resolution: 128 },
    fog: { enabled: false, color: '#EEF1F5', near: 60, far: 400 },
    toneMapping: 'neutral',
    exposure: 1,
    shadows: { enabled: true, type: 'pcf' },
  };
}

/** Returns the default shadow settings of a light. */
export function defaultShadow(): ShadowDef {
  return { mapSize: 2048, bias: -0.0005, normalBias: 0.04, radius: 4, cameraSize: 40 };
}

/** Returns a new built-in material with default values. */
export function defaultMaterial(name: string, type: MaterialType = 'standard'): BuiltinMaterialDef {
  return {
    name,
    type,
    color: '#FFFFFF',
    roughness: 0.7,
    metalness: 0,
    emissive: '#000000',
    emissiveIntensity: 1,
    opacity: 1,
    transparent: false,
    envMapIntensity: 1,
  };
}

/** Returns a scene definition with nothing in it. */
export function emptyScene(name = 'scene'): StageSceneDef {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    assets: [],
    overrides: {},
    placed: [],
    materials: {},
    materialAssignments: [],
    lights: [],
    environment: defaultEnvironment(),
    postprocess: [],
    components: [],
    empties: [],
    cameras: [],
    tracks: [],
    animations: [],
    timelines: [],
    render: defaultRender(),
  };
}

/** Thrown by normalizeScene when the file was written by a newer runtime than this one. */
export class SchemaVersionError extends Error {
  constructor(public readonly found: number) {
    super(`Cannot load scene format version ${found}: it is newer than this runtime (${SCHEMA_VERSION})`);
  }
}

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const vec = (v: unknown, d: Vec3): Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number') ? [v[0], v[1], v[2]] : d;
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const EASINGS = ['linear', 'easeInOut', 'easeOut', 'easeIn'];

function transform<T extends TransformDef>(raw: any, out: T): T {
  if (raw.position !== undefined) out.position = vec(raw.position, [0, 0, 0]);
  if (raw.rotation !== undefined) out.rotation = vec(raw.rotation, [0, 0, 0]);
  if (raw.scale !== undefined) out.scale = vec(raw.scale, [1, 1, 1]);
  return out;
}

function camera(c: any, i: number): CameraDef {
  const out: CameraDef = {
    id: str(c.id, `camera-${i + 1}`),
    name: str(c.name, `camera-${i + 1}`),
    position: vec(c.position, [10, 10, 10]),
    target: vec(c.target, [0, 0, 0]),
    fov: num(c.fov, 30),
    duration: num(c.duration, 10),
    blend: num(c.blend, 1.5),
    easing: EASINGS.includes(c.easing) ? c.easing : EASINGS.includes(c.ease) ? c.ease : 'easeInOut',
  };
  if (typeof c.targetObject === 'string' && c.targetObject) out.targetObject = c.targetObject;
  if (isObj(c.motion) && typeof c.motion.type === 'string' && c.motion.type) out.motion = { type: c.motion.type, params: isObj(c.motion.params) ? { ...c.motion.params } : {} };
  return out;
}

function activationTrack(tr: any, i: number): ActivationTrackDef {
  return {
    id: str(tr.id, `track-${i + 1}`),
    target: str(tr.target, ''),
    clips: (Array.isArray(tr.clips) ? tr.clips : []).filter(isObj).map((c: any, k: number) => {
      const start = Math.max(0, num(c.start, 0));
      return {
        id: str(c.id, `clip-${i + 1}-${k + 1}`),
        start,
        end: Math.max(start + 0.1, num(c.end, start + 5)),
        fadeIn: Math.max(0, num(c.fadeIn, 0)),
        fadeOut: Math.max(0, num(c.fadeOut, 0)),
      };
    }),
  };
}

function animationTrack(tr: any, n: string): AnimationTrackDef {
  return {
    id: str(tr.id, `track-${n}`),
    target: str(tr.target, ''),
    clips: (Array.isArray(tr.clips) ? tr.clips : []).filter(isObj).map((c: any, j: number) => {
      const start = Math.max(0, num(c.start, 0));
      return { id: str(c.id, `clip-${n}-${j + 1}`), start, end: Math.max(start + 0.1, num(c.end, start + 1)), clip: str(c.clip, '') };
    }),
  };
}

/** Returns the length of an Event Timeline: the end of the Clip that ends last. */
export function eventTimelineLength(tl: EventTimelineDef) {
  let end = 0;
  for (const tr of tl.tracks) for (const c of tr.clips) end = Math.max(end, c.end);
  for (const tr of tl.animations) for (const c of tr.clips) end = Math.max(end, c.end);
  return end;
}

/**
 * Converts format 1 shots and sequence into cameras and 2D UI Activation Tracks (scene X becomes a span on 'ui:X').
 * Each span ends where its last camera's blend starts, because format 1 hid the 2D UI during camera moves.
 */
function fromSequence(raw: any, s: StageSceneDef) {
  const shots: any[] = Array.isArray(raw.shots) ? raw.shots.filter(isObj) : [];
  const sequence: any[] = Array.isArray(raw.sequence) ? raw.sequence.filter(isObj) : [];
  const byId = new Map(shots.map((sh, i) => [str(sh.id, `shot-${i + 1}`), { sh, i }]));
  const order: { sh: any; i: number; scene: string | null }[] = [];
  if (sequence.length) {
    for (const q of sequence) for (const id of Array.isArray(q.shots) ? q.shots : []) {
      const x = byId.get(id);
      if (x) order.push({ ...x, scene: str(q.id, '') });
    }
    const used = new Set(order.map((x) => x.sh));
    for (const [, x] of byId) if (!used.has(x.sh)) order.push({ ...x, scene: null });
  } else {
    for (const [, x] of byId) order.push({ ...x, scene: null });
  }
  s.cameras = order.map((x) => camera(x.sh, x.i));
  let t = 0;
  const spans = new Map<string, { start: number; end: number; blend: number }>();
  order.forEach((x, k) => {
    const c = s.cameras[k];
    const d = Math.max(0.1, c.duration);
    if (x.scene) {
      const sp = spans.get(x.scene);
      if (sp) {
        sp.end = t + d;
        sp.blend = c.blend;
      } else spans.set(x.scene, { start: t, end: t + d, blend: c.blend });
    }
    t += d;
  });
  s.tracks = [...spans].map(([id, sp], k) => ({
    id: `track-${k + 1}`,
    target: 'ui:' + id,
    clips: [{ id: `clip-${k + 1}`, start: sp.start, end: Math.max(sp.start + 0.1, sp.end - sp.blend), fadeIn: 0.3, fadeOut: 0.3 }],
  }));
}

/**
 * Converts parsed JSON into the current scene format.
 * Missing fields get their defaults, and older formats are upgraded here.
 * @throws {@link SchemaVersionError} when the file is from a newer format version.
 */
export function normalizeScene(raw: unknown): StageSceneDef {
  if (!isObj(raw)) throw new Error('The scene definition is not a JSON object');
  const version = num(raw.schemaVersion, SCHEMA_VERSION);
  if (version > SCHEMA_VERSION) throw new SchemaVersionError(version);
  const s = emptyScene(str(raw.name, 'scene'));

  if (Array.isArray(raw.assets)) s.assets = raw.assets.filter((a: unknown) => typeof a === 'string');

  if (isObj(raw.overrides)) {
    for (const [name, o] of Object.entries(raw.overrides)) {
      if (!isObj(o)) continue;
      const ov: ObjectOverride = transform(o, {});
      if (typeof o.visible === 'boolean') ov.visible = o.visible;
      if (typeof o.castShadow === 'boolean') ov.castShadow = o.castShadow;
      if (typeof o.receiveShadow === 'boolean') ov.receiveShadow = o.receiveShadow;
      if (typeof o.clip === 'string') ov.clip = o.clip;
      if (typeof o.loop === 'boolean') ov.loop = o.loop;
      s.overrides[name] = ov;
    }
  }

  if (Array.isArray(raw.placed)) {
    s.placed = raw.placed.filter(isObj).map((p: any, i: number) => {
      const out = transform<PlacedDef>(p, { id: str(p.id, `placed-${i + 1}`), name: str(p.name, `placed-${i + 1}`), asset: str(p.asset, '') });
      if (typeof p.castShadow === 'boolean') out.castShadow = p.castShadow;
      if (typeof p.receiveShadow === 'boolean') out.receiveShadow = p.receiveShadow;
      if (typeof p.clip === 'string' && p.clip) out.clip = p.clip;
      if (typeof p.loop === 'boolean') out.loop = p.loop;
      return out;
    });
  }

  if (isObj(raw.materials)) {
    for (const [id, m] of Object.entries(raw.materials)) {
      if (!isObj(m)) continue;
      // A registered shader type. Its values are kept even if the reader has no such type registered.
      if (typeof m.type === 'string' && m.type && !isBuiltinMaterialType(m.type)) {
        s.materials[id] = {
          name: str(m.name, id),
          type: m.type,
          params: isObj(m.params) ? { ...m.params } : {},
          binding: isObj(m.binding) ? Object.fromEntries(Object.entries(m.binding).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {},
        };
        continue;
      }
      const type: MaterialType = m.type === 'physical' ? 'physical' : 'standard';
      const d = defaultMaterial(str(m.name, id), type);
      const out: BuiltinMaterialDef = {
        name: d.name,
        type,
        color: str(m.color, d.color),
        roughness: num(m.roughness, d.roughness),
        metalness: num(m.metalness, d.metalness),
        emissive: str(m.emissive, d.emissive),
        emissiveIntensity: num(m.emissiveIntensity, d.emissiveIntensity),
        opacity: num(m.opacity, d.opacity),
        transparent: bool(m.transparent, d.transparent),
        envMapIntensity: num(m.envMapIntensity, d.envMapIntensity),
      };
      for (const k of MATERIAL_MAPS) if (typeof m[k] === 'string' && m[k]) out[k] = m[k];
      for (const k of ['clearcoat', 'clearcoatRoughness', 'transmission', 'thickness', 'ior', 'sheen'] as const) {
        if (typeof m[k] === 'number') out[k] = m[k];
      }
      if (typeof m.sheenColor === 'string') out.sheenColor = m.sheenColor;
      s.materials[id] = out;
    }
  }

  if (Array.isArray(raw.materialAssignments)) {
    s.materialAssignments = raw.materialAssignments
      .filter(isObj)
      .map((a: any) => ({ object: str(a.object, ''), slot: str(a.slot, ''), material: str(a.material, '') }))
      .filter((a: MaterialAssignment) => a.object && a.slot && a.material);
  }

  if (Array.isArray(raw.lights)) {
    s.lights = raw.lights.filter(isObj).map((l: any, i: number) => {
      const type: LightType = ['directional', 'point', 'spot', 'hemisphere', 'ambient'].includes(l.type) ? l.type : 'point';
      const out: LightDef = {
        id: str(l.id, `light-${i + 1}`),
        name: str(l.name, `light-${i + 1}`),
        type,
        color: str(l.color, '#FFFFFF'),
        intensity: num(l.intensity, 1),
        position: vec(l.position, [0, 10, 0]),
        target: vec(l.target, [0, 0, 0]),
        castShadow: bool(l.castShadow, false),
      };
      if (typeof l.targetObject === 'string' && l.targetObject) out.targetObject = l.targetObject;
      if (typeof l.groundColor === 'string') out.groundColor = l.groundColor;
      for (const k of ['distance', 'decay', 'angle', 'penumbra'] as const) if (typeof l[k] === 'number') out[k] = l[k];
      if (isObj(l.shadow)) {
        const d = defaultShadow();
        out.shadow = {
          mapSize: num(l.shadow.mapSize, d.mapSize),
          bias: num(l.shadow.bias, d.bias),
          normalBias: num(l.shadow.normalBias, d.normalBias),
          radius: num(l.shadow.radius, d.radius),
          cameraSize: num(l.shadow.cameraSize, num(l.shadow.area, d.cameraSize)),
        };
      }
      return out;
    });
  }

  if (isObj(raw.environment)) {
    const e = raw.environment;
    const d = s.environment;
    const bg = isObj(e.background) ? e.background : {};
    s.environment = {
      background: {
        type: ['none', 'color', 'environment'].includes(bg.type) ? bg.type : d.background.type,
        color: str(bg.color, d.background.color),
        blur: num(bg.blur, d.background.blur),
      },
      source: ['none', 'room', 'hdri'].includes(e.source) ? e.source : d.source,
      intensity: num(e.intensity, d.intensity),
      rotation: num(e.rotation, d.rotation),
      blend: Math.min(1, Math.max(0, num(e.blend, d.blend))),
      reflection: isObj(e.reflection)
        ? {
            enabled: bool(e.reflection.enabled, true),
            position: vec(e.reflection.position, d.reflection.position),
            resolution: PROBE_SIZES.includes(e.reflection.resolution) ? e.reflection.resolution : d.reflection.resolution,
          }
        : d.reflection,
      fog: isObj(e.fog)
        ? { enabled: bool(e.fog.enabled, false), color: str(e.fog.color, d.fog.color), near: num(e.fog.near, d.fog.near), far: num(e.fog.far, d.fog.far) }
        : d.fog,
      toneMapping: ['none', 'linear', 'reinhard', 'cineon', 'aces', 'agx', 'neutral'].includes(e.toneMapping) ? e.toneMapping : d.toneMapping,
      exposure: num(e.exposure, d.exposure),
      shadows: isObj(e.shadows)
        ? { enabled: bool(e.shadows.enabled, true), type: ['pcf', 'vsm', 'basic'].includes(e.shadows.type) ? e.shadows.type : 'pcf' }
        : d.shadows,
    };
    if (typeof e.hdri === 'string' && e.hdri) s.environment.hdri = e.hdri;
    if (typeof e.hdriB === 'string' && e.hdriB) s.environment.hdriB = e.hdriB;
  }

  if (Array.isArray(raw.postprocess)) {
    s.postprocess = raw.postprocess
      .filter((p: any) => isObj(p) && typeof p.type === 'string' && p.type)
      .map((p: any, i: number) => {
        const id = str(p.id, `fx-${i + 1}`);
        const enabled = bool(p.enabled, true);
        if (isBuiltinPostEffect(p.type)) {
          const params = isObj(p.params) ? Object.fromEntries(Object.entries(p.params).filter(([, v]) => typeof v === 'number')) : {};
          return { id, type: p.type, enabled, params };
        }
        // A registered type. Its values are kept even if the reader has no such type registered.
        const params = isObj(p.params) ? { ...p.params } : {};
        const binding = isObj(p.binding) ? (Object.fromEntries(Object.entries(p.binding).filter(([, v]) => typeof v === 'string')) as Record<string, string>) : {};
        return { id, type: p.type, enabled, params, binding };
      });
  }

  if (Array.isArray(raw.components)) {
    s.components = raw.components.filter(isObj).map((c: any, i: number) =>
      transform<ComponentInstanceDef>(c, {
        id: str(c.id, `component-${i + 1}`),
        name: str(c.name, str(c.type, 'component')),
        type: str(c.type, ''),
        enabled: bool(c.enabled, true),
        params: isObj(c.params) ? { ...c.params } : {},
        binding: isObj(c.binding) ? Object.fromEntries(Object.entries(c.binding).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {},
      }),
    );
  }

  // Format 1 calls these anchors (with attachTo).
  const empties = Array.isArray(raw.empties) ? raw.empties : Array.isArray(raw.anchors) ? raw.anchors : [];
  s.empties = empties.filter(isObj).map((a: any, i: number) => {
    const out: EmptyDef = { id: str(a.id, `empty-${i + 1}`), name: str(a.name, `empty-${i + 1}`), position: vec(a.position, [0, 0, 0]) };
    const parent = str(a.parent, str(a.attachTo, ''));
    if (parent) out.parent = parent;
    return out;
  });

  if (version < 2) fromSequence(raw, s);
  else {
    if (Array.isArray(raw.cameras)) s.cameras = raw.cameras.filter(isObj).map(camera);
    if (Array.isArray(raw.tracks)) s.tracks = raw.tracks.filter(isObj).map(activationTrack);
  }

  if (Array.isArray(raw.timelines)) {
    s.timelines = raw.timelines.filter(isObj).map((tl: any, i: number) => ({
      id: str(tl.id, `timeline-${i + 1}`),
      name: str(tl.name, `Event ${i + 1}`),
      trigger: isObj(tl.trigger) ? { type: str(tl.trigger.type, 'none'), params: isObj(tl.trigger.params) ? { ...tl.trigger.params } : {} } : { type: 'none', params: {} },
      tracks: (Array.isArray(tl.tracks) ? tl.tracks : []).filter(isObj).map(activationTrack),
      animations: (Array.isArray(tl.animations) ? tl.animations : []).filter(isObj).map((tr: any, k: number) => animationTrack(tr, `${i + 1}-a${k + 1}`)),
    }));
  }
  if (Array.isArray(raw.animations)) s.animations = raw.animations.filter(isObj).map((tr: any, k: number) => animationTrack(tr, `a${k + 1}`));

  if (isObj(raw.render)) {
    const d = s.render;
    const q = isObj(raw.render.quality) ? raw.render.quality : {};
    const level = (v: unknown, dl: QualityDef): QualityDef =>
      isObj(v) ? { maxHeight: num(v.maxHeight, dl.maxHeight), shadowMapScale: num(v.shadowMapScale, num(v.shadowScale, dl.shadowMapScale)) } : { ...dl };
    // Format 1 stores these as auto.fallbackHeight and auto.slowMs.
    const dr = isObj(raw.render.dynamicResolution) ? raw.render.dynamicResolution : isObj(raw.render.auto) ? raw.render.auto : {};
    const ar = raw.render.aspectRatio;
    s.render = {
      aspectRatio: Array.isArray(ar) && ar.length === 2 && ar.every((n: unknown) => typeof n === 'number' && n > 0) ? [ar[0], ar[1]] : d.aspectRatio,
      quality: { high: level(q.high, d.quality.high), low: level(q.low, d.quality.low) },
      dynamicResolution: {
        minHeight: num(dr.minHeight, num(dr.fallbackHeight, d.dynamicResolution.minHeight)),
        frameTimeThreshold: num(dr.frameTimeThreshold, num(dr.slowMs, d.dynamicResolution.frameTimeThreshold)),
      },
    };
  }

  return s;
}
