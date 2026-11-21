// Measures rendering cost per frame by hooking WebGL2 calls in headless Chrome. Output: packages/studio/tools/README.md.
// Usage: node tools/measure.mjs <URL or runs.json> [gpu|swiftshader]
// runs.json: [{ "label": "overview", "url": "...", "js": "expression (optional)", "warm": 8000, "sample": 6000 }]
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ARG = process.argv[2];
const MODE = process.argv[3] || 'gpu';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const runs = /\.json$/i.test(ARG) ? JSON.parse(readFileSync(ARG, 'utf8')) : [{ label: 'page', url: ARG }];
const PROF = join(tmpdir(), 'three-stage-tools', 'chrome-measure-' + MODE);
mkdirSync(PROF, { recursive: true });
try { rmSync(PROF + '/DevToolsActivePort'); } catch (e) {}
const flags = ['--headless=new', '--hide-scrollbars', '--remote-debugging-port=0', '--user-data-dir=' + PROF, '--window-size=1920,1080',
  '--no-first-run', '--disable-extensions', '--disable-gpu-vsync', '--disable-frame-rate-limit', 'about:blank'];
if (MODE === 'swiftshader') flags.unshift('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
else flags.unshift('--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11');
const chrome = spawn(CHROME, flags, { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let PORT = null;
for (let i = 0; i < 80 && !PORT; i++) { await sleep(250); try { PORT = readFileSync(PROF + '/DevToolsActivePort', 'utf8').split('\n')[0].trim(); } catch (e) {} }
if (!PORT) { console.error('Chrome did not start: ' + CHROME); chrome.kill(); process.exit(1); }
const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); let loaded = null; const errors = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300));
  if (d.method === 'Page.loadEventFired' && loaded) { loaded(); loaded = null; }
});
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : r; };

// Passes are keyed by viewport size, so passes rendered at the same size are counted as one.
const HOOK = `(() => {
  const S = window.__gl = { frames: [], programs: 0, types: {}, defs: {}, vp: [0, 0] };
  const nf = () => ({ calls: 0, inst: 0, tris: 0, lines: 0, pts: 0, passes: {} });
  S.cur = nf();
  const P = WebGL2RenderingContext.prototype;
  const oVp = P.viewport; P.viewport = function (x, y, w, h) { S.vp = [w, h]; return oVp.apply(this, arguments); };
  function add(mode, count, n) {
    const f = S.cur; f.calls++; if (n > 1) f.inst++;
    const key = S.vp[0] + 'x' + S.vp[1]; const p = f.passes[key] || (f.passes[key] = { calls: 0, tris: 0 }); p.calls++;
    let t = 0;
    if (mode === 4) t = Math.floor(count / 3) * n; else if (mode === 5 || mode === 6) t = Math.max(0, count - 2) * n;
    else if (mode === 0) f.pts += count * n; else f.lines += count * n;
    f.tris += t; p.tris += t;
  }
  const de = P.drawElements; P.drawElements = function (m, c) { add(m, c, 1); return de.apply(this, arguments); };
  const da = P.drawArrays; P.drawArrays = function (m, f, c) { add(m, c, 1); return da.apply(this, arguments); };
  const dei = P.drawElementsInstanced; P.drawElementsInstanced = function (m, c, t, o, n) { add(m, c, n); return dei.apply(this, arguments); };
  const dai = P.drawArraysInstanced; P.drawArraysInstanced = function (m, f, c, n) { add(m, c, n); return dai.apply(this, arguments); };
  const lp = P.linkProgram; P.linkProgram = function () { S.programs++; return lp.apply(this, arguments); };
  const ss = P.shaderSource; P.shaderSource = function (sh, src) {
    if (/void main/.test(src) && /gl_FragColor|pc_fragColor|out highp vec4/.test(src)) {
      const mt = src.match(/#define SHADER_TYPE (\\w+)/); const mn = src.match(/#define SHADER_NAME ([^\\n]+)/);
      const k = mt ? mt[1] : (mn ? 'name:' + mn[1].trim() : 'raw'); S.types[k] = (S.types[k] || 0) + 1;
    }
    ['NUM_DIR_LIGHTS', 'NUM_POINT_LIGHTS', 'NUM_SPOT_LIGHTS', 'NUM_HEMI_LIGHTS', 'NUM_RECT_AREA_LIGHTS', 'NUM_DIR_LIGHT_SHADOWS', 'NUM_POINT_LIGHT_SHADOWS', 'NUM_SPOT_LIGHT_SHADOWS'].forEach((k) => {
      const m = src.match(new RegExp('#define ' + k + ' (\\\\d+)')); if (m) S.defs[k] = Math.max(S.defs[k] || 0, +m[1]);
    });
    return ss.apply(this, arguments);
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    return raf(function (t) {
      const b = performance.now(); S.cur = nf(); cb(t); const f = S.cur; f.cpu = performance.now() - b; f.t = t;
      if (f.calls) { S.frames.push(f); if (S.frames.length > 2000) S.frames.shift(); }
    });
  };
})();`;

const SUM = `(() => {
  const S = window.__gl, fr = S.frames.slice();
  if (!fr.length) return 'no frames';
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const p95 = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length * 0.95)]; };
  const dts = []; for (let i = 1; i < fr.length; i++) dts.push(fr[i].t - fr[i - 1].t);
  const passes = {}; fr.forEach((f) => Object.keys(f.passes).forEach((k) => { (passes[k] = passes[k] || []).push(f.passes[k]); }));
  const pass = {}; Object.keys(passes).forEach((k) => { pass[k] = { frames: passes[k].length, calls: med(passes[k].map((p) => p.calls)), tris: med(passes[k].map((p) => p.tris)) }; });
  const c = document.querySelector('canvas');
  return { frames: fr.length, calls: med(fr.map((f) => f.calls)), callsMax: Math.max.apply(null, fr.map((f) => f.calls)), instanced: med(fr.map((f) => f.inst)),
    tris: med(fr.map((f) => f.tris)), trisMax: Math.max.apply(null, fr.map((f) => f.tris)), lines: med(fr.map((f) => f.lines)), points: med(fr.map((f) => f.pts)),
    cpuMs: +med(fr.map((f) => f.cpu)).toFixed(2), cpuP95: +p95(fr.map((f) => f.cpu)).toFixed(2),
    frameMs: dts.length ? +med(dts).toFixed(2) : null, frameP95: dts.length ? +p95(dts).toFixed(2) : null,
    canvas: c ? c.width + 'x' + c.height : null, programs: S.programs, pass: pass };
})()`;

await send('Runtime.enable'); await send('Page.enable');
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });

const gpu = await ev(`(() => { const g = document.createElement('canvas').getContext('webgl2'); if (!g) return 'no webgl2'; const x = g.getExtension('WEBGL_debug_renderer_info'); return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); })()`);
console.log('GPU: ' + gpu);

for (const r of runs) {
  if (r.url) { const p = new Promise((res) => { loaded = res; }); await send('Page.navigate', { url: r.url }); await Promise.race([p, sleep(15000)]); }
  if (r.js) await ev(r.js);
  await sleep(r.warm ?? 8000);
  await ev('window.__gl.frames.length = 0');
  await sleep(r.sample ?? 6000);
  console.log((r.label || r.url || 'run') + ' ' + JSON.stringify(await ev(SUM)));
}
console.log('shaders ' + JSON.stringify(await ev('window.__gl.types')));
console.log('lights ' + JSON.stringify(await ev('window.__gl.defs')));
console.log('errors: ' + (errors.length ? errors.join('\n') : 'none'));
ws.close(); chrome.kill(); process.exit(0);
