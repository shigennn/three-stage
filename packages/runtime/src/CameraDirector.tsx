import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CameraDef } from './schema';
import { ObjectFinder, applyPose, cameraTimeline, evaluateTimeline, newPose, type MotionAccess } from './cameras';
import type { Playback } from './playback';
import { useStageEnv } from './context';
import { useStageData } from './data';

const _p = new THREE.Vector3();

/**
 * Moves the camera along the Camera Track and advances `playback.t` while playing. Place it inside the Canvas.
 * StageView includes it.
 */
export function CameraDirector({ cameras, playback }: { cameras: CameraDef[]; playback: Playback }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);
  const env = useStageEnv();
  const data = useStageData();
  const [aw, ah] = env.render.aspectRatio;
  const timeline = useMemo(() => cameraTimeline(cameras), [cameras]);
  const finder = useMemo(() => new ObjectFinder(scene), [scene]);
  const pose = useMemo(newPose, []);
  const access = useMemo(() => {
    const a: MotionAccess & { now: number } = {
      now: 0,
      data: null,
      find: (name) => finder.get(name, a.now),
      findAll: (prefix) => finder.all(prefix, a.now),
    };
    return a;
  }, [finder]);
  // Priority -1 moves the camera before other useFrame callbacks (FollowTracker reads it).
  // Keep it negative: a positive priority stops R3F from rendering on its own.
  useFrame((state, dt) => {
    if (playback.playing) playback.t += Math.min(dt, 0.25);
    const now = state.clock.elapsedTime;
    const resolve = (name: string) => {
      const o = finder.get(name, now);
      return o ? o.getWorldPosition(_p) : null;
    };
    access.now = now;
    access.data = data.value;
    if (!evaluateTimeline(timeline, playback.t, pose, resolve, access)) return;
    playback.cameraId = pose.cameraId;
    playback.blending = pose.blend > 0;
    applyPose(camera, pose, size.width, size.height, aw / ah);
  }, -1);
  return null;
}
