// Memory check over a long, sped-up session: runs a page (normally the preview page with a high `speed`) and samples
// the JS heap after GC, live WebGL object counts and the DOM node count. A column fails as still growing when the
// minimum of its last third exceeds the maximum of its first third. Renders on the GPU unless --swiftshader is given.
// Usage: node tools/soak.mjs <URL> [--minutes 30] [--every 30] [--warmup 2] [--js expression] [--out out/soak.csv] [--swiftshader]
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { GPU_FLAGS, SWIFTSHADER_FLAGS, openChrome, sleep } from './chrome.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
};
const VALUE_OPTS = new Set(['--minutes', '--every', '--warmup', '--js', '--out']);
const URL_ = args.find((a, i) => !a.startsWith('--') && !VALUE_OPTS.has(args[i - 1]));
if (!URL_) {
  console.error('Usage: node tools/soak.mjs <URL> [--minutes 30] [--every 30] [--warmup 2] [--js expression] [--out out/soak.csv] [--swiftshader]');
  process.exit(2);
}
const MINUTES = Number(opt('--minutes', '30'));
const EVERY = Number(opt('--every', '30'));
const WARMUP = Number(opt('--warmup', '2'));
const JS = opt('--js', '');
const OUT = opt('--out', `out/soak-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.csv`);
const MODE = args.includes('--swiftshader') ? 'swiftshader' : 'gpu';
// Heap growth below this (MB) is GC noise, not a leak.
const HEAP_TOLERANCE_MB = 2;

const errors = [];
const { send, ev, navigate, close, profileDir } = await openChrome(
  // A new Chrome hands off to one already running on the same profile and exits, so each run needs its own profile.
  `chrome-soak-${MODE}-${process.pid}`,
  // Lift the frame-rate cap, and keep Chrome from throttling the headless tab as a background tab.
  [...(MODE === 'swiftshader' ? SWIFTSHADER_FLAGS : GPU_FLAGS), '--disable-gpu-vsync', '--disable-frame-rate-limit',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  (d) => { if (d.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300)); },
);

// Patches the WebGL2 prototype, so counts cover every context in the page. frames counts only rAF callbacks that
// issue a draw call: the page also runs rAF loops that don't render, and the 30fps cap skips rendering on some callbacks.
const HOOK = `(() => {
  const live = window.__glLive = {};
  const P = WebGL2RenderingContext.prototype;
  const kinds = { Texture: 'texture', Buffer: 'buffer', Framebuffer: 'framebuffer', Renderbuffer: 'renderbuffer', Program: 'program', Shader: 'shader', Query: 'query', VertexArray: 'vao', Sampler: 'sampler' };
  for (const [k, name] of Object.entries(kinds)) {
    live[name] = 0;
    const c = P['create' + k], d = P['delete' + k];
    if (!c || !d) continue;
    P['create' + k] = function () { const o = c.apply(this, arguments); if (o) live[name]++; return o; };
    P['delete' + k] = function (o) { if (o) live[name]--; return d.apply(this, arguments); };
  }
  let frames = 0; let drew = false;
  for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const f = P[k];
    P[k] = function () { drew = true; return f.apply(this, arguments); };
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { drew = false; cb(t); if (drew) frames++; });
  window.__frames = () => frames;
})();`;

await send('Runtime.enable'); await send('Page.enable'); await send('HeapProfiler.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
const gpu = await ev(`(() => { const g = document.createElement('canvas').getContext('webgl2'); if (!g) return 'no webgl2'; const x = g.getExtension('WEBGL_debug_renderer_info'); return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); })()`);
console.log('GPU: ' + gpu);
console.log(`Running ${URL_} for ${MINUTES} min, sampling every ${EVERY} s (the first ${WARMUP} min are not counted)`);

await navigate(URL_, 20000);
if (JS) await ev(JS);

const COLS = ['min', 'heapMB', 'texture', 'buffer', 'framebuffer', 'renderbuffer', 'program', 'shader', 'query', 'vao', 'dom', 'fps', 'frameMs'];
const rows = [];
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, COLS.join(',') + '\n');
const t0 = Date.now();
let lastFrames = 0;
let lastT = t0;
while (Date.now() - t0 < MINUTES * 60000) {
  await sleep(Math.max(0, EVERY * 1000 - ((Date.now() - t0) % (EVERY * 1000))));
  await send('HeapProfiler.collectGarbage');
  const heap = await send('Runtime.getHeapUsage');
  const s = await ev(`({ gl: window.__glLive, dom: document.getElementsByTagName('*').length, frames: window.__frames(), frameMs: window.__stage?.stats?.last?.frameMs ?? null })`);
  const now = Date.now();
  const fps = ((s.frames - lastFrames) * 1000) / (now - lastT);
  lastFrames = s.frames;
  lastT = now;
  const row = { min: +((now - t0) / 60000).toFixed(2), heapMB: +(heap.result.usedSize / 1048576).toFixed(2), ...s.gl, dom: s.dom, fps: +fps.toFixed(1), frameMs: s.frameMs === null ? '' : +s.frameMs.toFixed(2) };
  rows.push(row);
  writeFileSync(OUT, COLS.map((c) => row[c] ?? '').join(',') + '\n', { flag: 'a' });
  console.log(COLS.map((c) => `${c} ${row[c] ?? ''}`).join('  '));
}

const sample = rows.filter((r) => r.min >= WARMUP);
const verdicts = [];
if (sample.length < 3) {
  verdicts.push({ key: 'samples', ok: false, note: `only ${sample.length} samples after warmup. Increase --minutes or decrease --every` });
} else {
  const n = Math.floor(sample.length / 3) || 1;
  const head = sample.slice(0, n);
  const tail = sample.slice(-n);
  for (const key of ['heapMB', 'texture', 'buffer', 'framebuffer', 'renderbuffer', 'program', 'shader', 'query', 'vao', 'dom']) {
    const before = Math.max(...head.map((r) => r[key]));
    const after = Math.min(...tail.map((r) => r[key]));
    const tol = key === 'heapMB' ? HEAP_TOLERANCE_MB : 0;
    verdicts.push({ key, ok: after <= before + tol, note: `first-third max ${before}, last-third min ${after}` });
  }
  // Linear heap slope, for information only; not part of the verdict.
  const xs = sample.map((r) => r.min);
  const ys = sample.map((r) => r.heapMB);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / (xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1);
  console.log(`heap slope ${(slope * 60).toFixed(2)} MB/h (${(slope * 1440).toFixed(1)} MB over 24 h)`);
}
for (const v of verdicts) console.log(`${v.ok ? 'PASS' : 'FAIL'}  ${v.key}  ${v.note}`);
console.log('errors: ' + (errors.length ? errors.join('\n') : 'none'));
console.log('log: ' + OUT);
const ok = verdicts.every((v) => v.ok);
console.log(ok ? 'result: PASS' : 'result: FAIL');
close();
await sleep(1000);
try { rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
process.exit(ok ? 0 : 1);
