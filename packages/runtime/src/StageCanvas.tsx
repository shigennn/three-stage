import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FrameStats, GpuTimer, type FrameSample } from './stats';
import { useStageEnv } from './context';

// 30fps cap: on every rAF, check the time since the last render and skip unless 25ms have passed.
// Checking against exactly 33.3ms makes rAF timing jitter skip a render now and then, which makes the intervals uneven.
const MIN_INTERVAL_MS = 25;

function FrameDriver({ stats }: { stats?: FrameStats }) {
  const advance = useThree((s) => s.advance);
  const gl = useThree((s) => s.gl);
  const clock = useThree((s) => s.clock);
  const env = useStageEnv();
  const limit = env.settings.limitFps;
  // Read inside the loop so that pausing does not recreate the render loop.
  const paused = useRef(false);
  paused.current = !!env.paused;

  useEffect(() => {
    gl.info.autoReset = false;
    // Queries are only released by poll, so don't create the timer when there are no stats.
    const timer = stats ? new GpuTimer(gl.getContext() as WebGL2RenderingContext) : null;
    let raf = 0;
    let last = 0;
    const size = new THREE.Vector2();
    const sample: FrameSample = { t: 0, interval: 0, cpuMs: 0, calls: 0, triangles: 0, textures: 0, geometries: 0, programs: 0, width: 0, height: 0 };
    const onGpu = (ms: number) => stats?.pushGpu(ms);
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (limit && last && t - last < MIN_INTERVAL_MS) return;
      const interval = last ? t - last : 0;
      // With frameloop="never", R3F's useFrame delta is the difference from the previous advance time.
      // On the first frame and after the tab was in the background it is large, so the clock is moved up to keep the delta at one frame.
      if (!last || interval > 250) clock.elapsedTime = t / 1000 - 1 / 30;
      if (paused.current) clock.elapsedTime = t / 1000;
      last = t;
      gl.info.reset();
      timer?.begin();
      const c0 = performance.now();
      advance(t / 1000);
      const cpu = performance.now() - c0;
      timer?.end();
      if (stats && timer) {
        timer.poll(onGpu);
        gl.getDrawingBufferSize(size);
        sample.t = t;
        sample.interval = interval;
        sample.cpuMs = cpu;
        sample.calls = gl.info.render.calls;
        sample.triangles = gl.info.render.triangles;
        sample.textures = gl.info.memory.textures;
        sample.geometries = gl.info.memory.geometries;
        sample.programs = gl.info.programs?.length ?? 0;
        sample.width = size.x;
        sample.height = size.y;
        stats.push(sample);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      timer?.dispose();
    };
  }, [advance, gl, clock, limit, stats]);

  return null;
}

/**
 * Sets the pixel ratio so the output frame renders at its target height, capped by the quality level and the screen's pixel ratio.
 * Pass the ratio to the Canvas `dpr` prop: R3F resets a direct setDpr to that prop whenever the Canvas re-renders.
 */
function ResolutionController({ stats, onDpr }: { stats?: FrameStats; onDpr: (dpr: number) => void }) {
  const size = useThree((s) => s.size);
  const env = useStageEnv();
  const [dropped, setDropped] = useState(false);
  const { resolution, quality } = env.settings;
  const { maxHeight } = env.render.quality[quality];
  const { minHeight, frameTimeThreshold } = env.render.dynamicResolution;
  const [aw, ah] = env.render.aspectRatio;

  useEffect(() => {
    const aspect = aw / ah;
    const frameH = size.width / size.height > aspect ? size.height : size.width / aspect;
    if (frameH <= 0) return;
    const target = resolution === '720p' ? 720 : resolution === 'auto' && dropped ? minHeight : 1080;
    const lines = Math.min(target, maxHeight);
    // Never render finer than the screen's pixels; a small frame would otherwise draw 1080 lines just to scale them down.
    onDpr(Math.min(lines / frameH, window.devicePixelRatio || 1));
  }, [size.width, size.height, resolution, maxHeight, minHeight, dropped, onDpr, aw, ah]);

  // Dynamic Resolution: drop the resolution when frames keep taking longer than frameTimeThreshold. It is never raised again.
  useEffect(() => {
    if (resolution !== 'auto' || !stats || dropped) return;
    const id = setInterval(() => {
      const slow = stats.slowFrames(60, frameTimeThreshold);
      if (slow.of === 60 && slow.count > 12) setDropped(true);
    }, 2000);
    return () => clearInterval(id);
  }, [resolution, stats, dropped, frameTimeThreshold]);

  return null;
}

/** Props of {@link StageCanvas}. */
export interface StageCanvasProps {
  /** Contents of the R3F Canvas. */
  children: ReactNode;
  /** Receives per-frame measurements. Also needed for Dynamic Resolution. */
  stats?: FrameStats;
  /** Camera to render with instead of the Canvas default. */
  camera?: THREE.Camera;
  /** Called when a click hits no object. */
  onPointerMissed?: (e: MouseEvent) => void;
  /** Class name of the canvas wrapper. */
  className?: string;
  /** Style of the canvas wrapper. */
  style?: React.CSSProperties;
}

/**
 * An R3F Canvas set up for THREE Stage: its own render loop with the 30fps cap and pause,
 * rendering resolution from the quality settings and Dynamic Resolution, and per-frame stats.
 */
export function StageCanvas({ children, stats, camera, onPointerMissed, className, style }: StageCanvasProps) {
  const [dpr, setDpr] = useState(1);
  return (
    <Canvas
      className={className}
      style={style}
      frameloop="never"
      dpr={dpr}
      shadows
      flat={false}
      camera={camera as any}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      onPointerMissed={onPointerMissed}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
      }}
    >
      <FrameDriver stats={stats} />
      <ResolutionController stats={stats} onDpr={setDpr} />
      {children}
    </Canvas>
  );
}
