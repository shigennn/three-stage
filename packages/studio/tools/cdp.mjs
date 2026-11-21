// Runs the steps in steps.json in headless Chrome over CDP and takes 1920x1080 screenshots.
// Usage: node tools/cdp.mjs steps.json <output folder> [profile name]. Step fields: packages/studio/tools/README.md.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GPU_FLAGS, SWIFTSHADER_FLAGS, openChrome, sleep } from './chrome.mjs';

const steps = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const errors = [];
// SwiftShader unless CDP_GPU=1. Under SwiftShader, playback barely advances between screenshots.
const { send, navigate, close } = await openChrome('chrome-' + (process.argv[4] || 'prof'), process.env.CDP_GPU === '1' ? GPU_FLAGS : SWIFTSHADER_FLAGS, (d) => {
  if (d.method === 'Runtime.exceptionThrown') errors.push('exception: ' + JSON.stringify(d.params.exceptionDetails).slice(0, 400));
  if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) errors.push(d.params.type + ': ' + d.params.args.map((a) => a.value || a.description).join(' ').slice(0, 300));
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push('log: ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
});
await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

const results = [];
for (const st of steps) {
  if (st.url) await navigate(st.url, 10000);
  if (st.js) {
    const r = await send('Runtime.evaluate', { expression: st.js, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) errors.push(st.name + ' js: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  }
  for (const k of st.keys || []) {
    const mods = (k.ctrl ? 2 : 0) | (k.shift ? 8 : 0) | (k.alt ? 1 : 0);
    const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, modifiers: mods };
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    if (k.text) await send('Input.dispatchKeyEvent', { type: 'char', text: k.text, ...base });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(k.wait ?? 50);
  }
  for (const m of st.mouse || []) {
    const type = { down: 'mousePressed', move: 'mouseMoved', up: 'mouseReleased' }[m.type];
    await send('Input.dispatchMouseEvent', { type, x: m.x, y: m.y, button: m.type === 'move' && !m.held ? 'none' : 'left', buttons: m.type === 'up' || (m.type === 'move' && !m.held) ? 0 : 1, clickCount: m.type === 'move' ? 0 : 1, modifiers: m.ctrl ? 2 : 0 });
    await sleep(m.wait ?? 30);
  }
  if (st.wait) await sleep(st.wait);
  if (st.out) {
    const r = await send('Runtime.evaluate', { expression: st.out, awaitPromise: true, returnByValue: true });
    results.push((st.name || 'out') + ' ' + JSON.stringify(r.result && r.result.result ? r.result.result.value : r));
  }
  if (st.check) {
    const src = readFileSync(new URL('./check.js', import.meta.url), 'utf8');
    const r = await send('Runtime.evaluate', { expression: src, returnByValue: true });
    results.push((st.name || 'check') + ' ' + JSON.stringify(r.result && r.result.result ? r.result.result.value : r));
  }
  if (st.thumb) {
    const t = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 800 / 1920 } });
    writeFileSync(st.thumb, Buffer.from(t.result.data, 'base64'));
  }
  if (st.name && st.shot !== false) {
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(OUT + '/' + st.name + '.jpg', Buffer.from(shot.result.data, 'base64'));
  }
}
console.log(results.join('\n'));
console.log('errors: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
close();
process.exit(0);
