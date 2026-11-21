import { useEffect, useState } from 'react';
import { FrameStats, type StatsSnapshot } from '@three-stage/runtime';
import { useStudio } from '../store';

export const studioStats = new FrameStats();

// Frame-time and JS heap limits from docs/performance.md
export const FRAME_LIMIT = { 1080: 12, 720: 6 } as const;
export const HEAP_LIMIT_MB = 1024;

const f1 = (n: number) => n.toFixed(1);
const k = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n));

export function frameLimit(s: StatsSnapshot) {
  return FRAME_LIMIT[s.renderHeight <= 760 ? 720 : 1080];
}

/** Numbers at the top right of the Viewport. Names follow three.js renderer.info. Graphs are in the Profiler tab */
export function StatsOverlay() {
  const [s, setS] = useState<StatsSnapshot>(studioStats.last);
  const limitFps = useStudio((st) => st.settings.limitFps);
  const besideHelper = useStudio((st) => st.mode === 'edit' && st.gizmos.show && st.gizmos.viewHelper);
  useEffect(() => {
    const id = setInterval(() => setS({ ...studioStats.last }), 250);
    return () => clearInterval(id);
  }, []);
  const limit = frameLimit(s);
  const over = (b: boolean) => (b ? 'over' : '');
  return (
    <div className={'stats' + (besideHelper ? ' beside-helper' : '')}>
      <div>
        <b>{Math.round(s.fps)}</b> fps <span className={over(!limitFps && s.frameMs > limit)}>{f1(s.frameMs)} ms</span>
      </div>
      <div>
        CPU <span className={over(s.cpuMs > limit)}>{f1(s.cpuMs)}</span> ms  GPU <span className={over((s.gpuMs ?? 0) > limit)}>{s.gpuMs === null ? '―' : f1(s.gpuMs)}</span> ms
      </div>
      <div>
        Calls {s.calls}  Triangles {k(s.triangles)}
      </div>
      <div>
        Geometries {s.geometries}  Textures {s.textures}
      </div>
      <div>
        JS Heap <span className={over((s.heapMB ?? 0) > HEAP_LIMIT_MB)}>{s.heapMB === null ? '―' : f1(s.heapMB)}</span> MB  GC Alloc {s.garbageMBps === null ? '―' : f1(s.garbageMBps)} MB/s
      </div>
    </div>
  );
}
