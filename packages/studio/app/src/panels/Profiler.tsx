import { useEffect, useRef, useState } from 'react';
import { HEAP_LIMIT_MB, frameLimit, studioStats } from '../viewport/StatsOverlay';

// Profiler tab: one graph per metric. Sampling starts when this module loads, so history exists even while the tab is closed.

const RATE_MS = 250;
const SPAN = 240;

interface Point {
  frameMs: number;
  cpuMs: number;
  gpuMs: number;
  heapMB: number;
  gcAlloc: number;
  calls: number;
  limit: number;
}

const points: Point[] = [];
const listeners = new Set<() => void>();

const timer = setInterval(() => {
  const s = studioStats.last;
  points.push({
    frameMs: s.frameMs,
    cpuMs: s.cpuMs,
    gpuMs: s.gpuMs ?? NaN,
    heapMB: s.heapMB ?? NaN,
    gcAlloc: s.garbageMBps ?? NaN,
    calls: s.calls,
    limit: frameLimit(s),
  });
  if (points.length > SPAN) points.shift();
  listeners.forEach((f) => f());
}, RATE_MS);
import.meta.hot?.dispose(() => clearInterval(timer));

interface Series {
  key: keyof Point;
  color: string;
  label: string;
}

interface Module {
  title: string;
  unit: string;
  series: Series[];
  /** Minimum top of the vertical axis; the axis grows past it with the data */
  min: (p: Point[]) => number;
  /** Values to draw as horizontal guide lines (the limits) */
  guides?: (p: Point[]) => number[];
  digits: number;
}

const MODULES: Module[] = [
  {
    title: 'Frame Time',
    unit: 'ms',
    series: [{ key: 'frameMs', color: '#D1D5DB', label: '' }],
    min: () => 40,
    guides: (p) => [33.3, p[p.length - 1]?.limit ?? 12],
    digits: 1,
  },
  {
    title: 'CPU / GPU',
    unit: 'ms',
    series: [
      { key: 'cpuMs', color: '#7DD3FC', label: 'CPU' },
      { key: 'gpuMs', color: '#FDBA74', label: 'GPU' },
    ],
    min: () => 16,
    guides: (p) => [p[p.length - 1]?.limit ?? 12],
    digits: 1,
  },
  { title: 'JS Heap', unit: 'MB', series: [{ key: 'heapMB', color: '#A5B4FC', label: '' }], min: () => 64, guides: () => [HEAP_LIMIT_MB], digits: 1 },
  { title: 'GC Alloc', unit: 'MB/s', series: [{ key: 'gcAlloc', color: '#F87171', label: '' }], min: () => 2, digits: 2 },
  {
    title: 'Calls',
    unit: '',
    series: [{ key: 'calls', color: '#86EFAC', label: '' }],
    min: () => 100,
    digits: 0,
  },
];

function Chart({ m }: { m: Module }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [values, setValues] = useState<string[]>([]);
  useEffect(() => {
    const draw = () => {
      const c = canvas.current;
      if (!c) return;
      const W = (c.width = c.clientWidth * devicePixelRatio);
      const H = (c.height = c.clientHeight * devicePixelRatio);
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, W, H);
      let top = m.min(points);
      for (const p of points) for (const s of m.series) if (Number.isFinite(p[s.key] as number)) top = Math.max(top, (p[s.key] as number) * 1.1);
      const y = (v: number) => H - (v / top) * (H - 4) - 2;
      const x = (i: number) => W - ((points.length - 1 - i) / (SPAN - 1)) * W;
      g.lineWidth = devicePixelRatio;
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.setLineDash([4 * devicePixelRatio, 4 * devicePixelRatio]);
      for (const v of m.guides?.(points) ?? []) {
        if (v > top) continue;
        g.beginPath();
        g.moveTo(0, y(v));
        g.lineTo(W, y(v));
        g.stroke();
      }
      g.setLineDash([]);
      for (const s of m.series) {
        g.strokeStyle = s.color;
        g.beginPath();
        let started = false;
        points.forEach((p, i) => {
          const v = p[s.key] as number;
          if (!Number.isFinite(v)) return void (started = false);
          started ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v));
          started = true;
        });
        g.stroke();
      }
      const last = points[points.length - 1];
      setValues(m.series.map((s) => (last && Number.isFinite(last[s.key] as number) ? (last[s.key] as number).toFixed(m.digits) : '―')));
    };
    draw();
    listeners.add(draw);
    return () => void listeners.delete(draw);
  }, [m]);
  return (
    <div className="prof-row">
      <div className="prof-label">
        <div className="prof-title">{m.title}</div>
        {m.series.map((s, i) => (
          <div key={s.key} className="prof-value">
            <span className="prof-key" style={{ background: s.color }} />
            {s.label && <span className="dim">{s.label}</span>} {values[i] ?? '―'} <span className="dim">{m.unit}</span>
          </div>
        ))}
      </div>
      <canvas ref={canvas} className="prof-chart" />
    </div>
  );
}

export function Profiler() {
  return (
    <div className="profiler">
      {MODULES.map((m) => (
        <Chart key={m.title} m={m} />
      ))}
    </div>
  );
}
