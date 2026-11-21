import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'virtual:three-stage/project';
import { EventStore, FrameStats, StageView, registry, todayAt, type Quality, type Resolution } from '@three-stage/runtime';
import { contentUrl, DECODERS } from './api';

// Render-only page: draws the scene exactly as the exported component does. packages/studio/tools/cdp.mjs and measure.mjs open it.
// ?scene=scenes/main.stage.json&start=09:00&speed=60&variant=b&limit=0&res=1080p&quality=high
// bundle=/dist/bundle/manifest.json loads the published scene bundle instead of the scene in content/, the way the host app does
// ui=0 hides the 2D UI (to measure the cost of 3D alone)

const q = new URLSearchParams(location.search);
const scenePath = q.get('scene') || 'scenes/main.stage.json';
const bundle = q.get('bundle');
const [hh, mm] = (q.get('start') || '12:00').split(':').map(Number);
const speed = Number(q.get('speed') ?? '60');
const stats = new FrameStats();
const events = new EventStore();
/** Events played (name and Key). Read by tools/cdp.mjs */
const played: string[] = [];
events.onPlay((name, key, source) => played.push(`${name} ${key} ${source}`));

function Preview() {
  const [data, setData] = useState<{ value: unknown; receivedAt: number | null }>({ value: null, receivedAt: null });
  useEffect(() => {
    let minutes = hh * 60 + (mm || 0);
    let last = performance.now();
    let raf = 0;
    let prevAt: number | null = null;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      minutes = (minutes + (Math.min(0.25, (t - last) / 1000) * speed) / 60) % 1440;
      last = t;
      const mock = registry.mock();
      if (!mock) return;
      const r = mock.sample(minutes, q.get('variant') || mock.variants[0]?.id || '');
      if (r.receivedAt !== prevAt) {
        prevAt = r.receivedAt;
        setData({ value: r.value, receivedAt: todayAt(r.receivedAt) });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <StageView
      {...(bundle ? { bundle } : { sceneUrl: contentUrl(scenePath), contentBase: '/content/', decoders: DECODERS })}
      data={data.value}
      receivedAt={data.receivedAt}
      stats={stats}
      events={events}
      overlay={q.get('ui') !== '0'}
      settings={{
        limitFps: q.get('limit') !== '0',
        resolution: (q.get('res') as Resolution) || '1080p',
        quality: (q.get('quality') as Quality) || 'high',
      }}
    />
  );
}

(window as any).__stage = { stats, events, played };
// Render under StrictMode like a typical React host app, so effects run twice in development here too
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
