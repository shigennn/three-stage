import * as THREE from 'three';
import type { CameraDef, EasingName, Vec3 } from './schema';
import { defaultParams, registry, type CameraMotionContext, type CameraMotionDef, type ParamValues } from './registry';

const D2R = Math.PI / 180;

/** Easing functions by name. Each maps 0..1 to 0..1. */
export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

/** A camera pose computed from the Camera Track. */
export interface CameraPose {
  /** Camera position. */
  position: Vec3;
  /** Point the camera looks at. */
  target: Vec3;
  /** Vertical field of view (degrees) relative to the output frame. */
  fov: number;
  /** Id of the current camera, or null before the first evaluation. */
  cameraId: string | null;
  /** How far the move into the next camera has progressed (0 when not blending). */
  blend: number;
}

/** One camera on a {@link CameraTimeline}. */
export interface TimelineEntry {
  /** The camera definition. */
  camera: CameraDef;
  /** Seconds from the start of the Timeline. */
  start: number;
  /** Seconds on the track, never shorter than 0.1. */
  duration: number;
}

/** The cameras laid out in time. */
export interface CameraTimeline {
  /** Cameras in playing order. */
  entries: TimelineEntry[];
  /** Length of the Timeline: one full loop. */
  total: number;
}

/** Lays out the cameras one after another in time. */
export function cameraTimeline(cameras: CameraDef[]): CameraTimeline {
  let t = 0;
  const entries = cameras.map((camera) => {
    const duration = Math.max(0.1, camera.duration);
    const e = { camera, start: t, duration };
    t += duration;
    return e;
  });
  return { entries, total: t };
}

/** Returns a new, empty {@link CameraPose} to pass to evaluateTimeline. */
export function newPose(): CameraPose {
  return { position: [0, 0, 0], target: [0, 0, 0], fov: 30, cameraId: null, blend: 0 };
}

/** Returns the world position of the object named by targetObject, or null if not found. */
export type TargetResolver = (name: string) => THREE.Vector3 | null;

/** Lets camera motions read objects and data. Without it, no motion is applied and the camera stays at its set position. */
export interface MotionAccess {
  /** The latest data. */
  data: unknown;
  /** Finds an object by name. */
  find(name: string): THREE.Object3D | null;
  /** Finds the objects whose names start with `prefix`, in numeric order. */
  findAll(prefix: string): THREE.Object3D[];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const shot = () => ({ position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30 });
const _cur = shot();
const _next = shot();
const _base = shot();
const _ctx: CameraMotionContext = { time: 0, t: 0, length: 0, base: _base, data: null, find: () => null, findAll: () => [] };
const paramCache = new WeakMap<object, { def: CameraMotionDef<any>; values: ParamValues }>();

function targetOf(c: CameraDef, resolve: TargetResolver | undefined, out: THREE.Vector3) {
  const p = c.targetObject && resolve ? resolve(c.targetObject) : null;
  return p ? out.copy(p) : out.set(c.target[0], c.target[1], c.target[2]);
}

function motionParams(def: CameraMotionDef<any>, params: Record<string, unknown>) {
  let c = paramCache.get(params);
  if (!c || c.def !== def) paramCache.set(params, (c = { def, values: defaultParams(def, params) }));
  return c.values;
}

const blendOf = (e: TimelineEntry) => Math.min(Math.max(0, e.camera.blend), e.duration);

/** Writes to `out` the pose of camera entries[i] at `since` seconds after it starts coming in. `since` counts from the start of the previous camera's blend. */
function shotPose(tl: CameraTimeline, i: number, since: number, time: number, out: typeof _cur, resolve?: TargetResolver, access?: MotionAccess) {
  const { entries } = tl;
  const e = entries[i];
  const c = e.camera;
  out.position.set(c.position[0], c.position[1], c.position[2]);
  targetOf(c, resolve, out.target);
  out.fov = c.fov;
  const def = c.motion && access ? registry.cameraMotion(c.motion.type) : undefined;
  if (!def || !access) return;
  _base.position.copy(out.position);
  _base.target.copy(out.target);
  _base.fov = out.fov;
  const inBlend = entries.length > 1 ? blendOf(entries[(i - 1 + entries.length) % entries.length]) : 0;
  _ctx.time = time;
  _ctx.t = since;
  _ctx.length = inBlend + e.duration;
  _ctx.data = access.data;
  _ctx.find = access.find;
  _ctx.findAll = access.findAll;
  def.apply(out, _ctx, motionParams(def, c.motion!.params));
}

/**
 * Writes the camera pose at playback time `t` (seconds) to `out`. Each camera moves into the next during its last `blend` seconds, and the last camera moves into the first.
 * With `access`, camera motions are applied. During a blend, the previous and next cameras are each moved before being mixed.
 * @returns `out`, or null when there are no cameras.
 */
export function evaluateTimeline(
  tl: CameraTimeline,
  t: number,
  out: CameraPose = newPose(),
  resolve?: TargetResolver,
  access?: MotionAccess,
): CameraPose | null {
  const { entries, total } = tl;
  if (!entries.length) return null;
  const tt = ((t % total) + total) % total;
  let i = entries.length - 1;
  for (let k = 0; k < entries.length; k++) {
    if (tt < entries[k].start + entries[k].duration) {
      i = k;
      break;
    }
  }
  const n = entries.length;
  const cur = entries[i].camera;
  const d = entries[i].duration;
  const b = blendOf(entries[i]);
  const local = tt - entries[i].start;
  out.cameraId = cur.id;
  const u = n > 1 && b > 0 && local > d - b ? EASINGS[cur.easing]((local - (d - b)) / b) : 0;
  out.blend = u;
  shotPose(tl, i, (n > 1 ? blendOf(entries[(i - 1 + n) % n]) : 0) + local, t, _cur, resolve, access);
  if (u > 0) {
    shotPose(tl, (i + 1) % n, local - (d - b), t, _next, resolve, access);
    _cur.position.lerp(_next.position, u);
    _cur.target.lerp(_next.target, u);
    _cur.fov = lerp(_cur.fov, _next.fov, u);
  }
  _cur.position.toArray(out.position);
  _cur.target.toArray(out.target);
  out.fov = _cur.fov;
  return out;
}

/** Converts a vertical field of view for the output frame (aspect ratio `aspect`) into one for the canvas's aspect ratio. */
export function canvasFov(frameFov: number, width: number, height: number, aspect: number) {
  if (width / height >= aspect) return frameFov;
  const frameH = width / aspect;
  return (2 * Math.atan(Math.tan((frameFov * D2R) / 2) * (height / frameH))) / D2R;
}

/** Applies a pose to a camera, adjusting the field of view so the output frame fits a canvas of the given size. */
export function applyPose(camera: THREE.PerspectiveCamera, pose: { position: Vec3; target: Vec3; fov: number }, width: number, height: number, aspect: number) {
  camera.position.set(...pose.position);
  camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
  camera.fov = canvasFov(pose.fov, width, height, aspect);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

/** Converts a canvas field of view back into the vertical field of view of the output frame. The inverse of {@link canvasFov}. */
export function frameFov(canvasFovDeg: number, width: number, height: number, aspect: number) {
  if (width / height >= aspect) return canvasFovDeg;
  const frameH = width / aspect;
  return (2 * Math.atan(Math.tan((canvasFovDeg * D2R) / 2) * (frameH / height))) / D2R;
}

/** Finds objects by name. Looking up a missing name every frame would walk the whole scene, so misses are searched again at most once per second. */
export class ObjectFinder {
  private found = new Map<string, { obj: THREE.Object3D | null; at: number }>();
  private groups = new Map<string, { list: THREE.Object3D[]; at: number }>();
  constructor(private scene: THREE.Object3D) {}

  /**
   * Returns the objects whose names start with `prefix`, sorted by the numbers in their names.
   * Children of a match are not searched (so same-prefix names inside a glb are not picked up). Searched again at most once per second.
   */
  all(prefix: string, now: number) {
    let g = this.groups.get(prefix);
    if (!g || now - g.at > 1 || now < g.at || g.list.some((o) => !o.parent)) {
      const list: THREE.Object3D[] = [];
      const walk = (o: THREE.Object3D) => {
        for (const c of o.children) {
          if (c.name.startsWith(prefix)) list.push(c);
          else walk(c);
        }
      };
      walk(this.scene);
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      this.groups.set(prefix, (g = { list, at: now }));
    }
    return g.list;
  }

  /** Returns the object with this name, or null. `now` is the current time in seconds. */
  get(name: string, now: number) {
    let c = this.found.get(name);
    if (!c || (c.obj && !c.obj.parent) || (c.obj && c.obj.name !== name) || (!c.obj && now - c.at > 1)) {
      this.found.set(name, (c = { obj: this.scene.getObjectByName(name) ?? null, at: now }));
    }
    return c.obj;
  }
}
