// Launches headless Chrome and connects over CDP. measure.mjs does not use this: frame times read about 0.5 ms longer through it.
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const GPU_FLAGS = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'];
/** CPU rendering: works without a GPU, but each frame is slow. */
export const SWIFTSHADER_FLAGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/**
 * @param {string} profile folder name under three-stage-tools in the OS temp folder
 * @param {string[]} flags Chrome flags added to the fixed headless 1920x1080 set
 * @param {(d: any) => void} [onEvent] receives CDP events (not command responses)
 */
export async function openChrome(profile, flags, onEvent) {
  const prof = join(tmpdir(), 'three-stage-tools', profile);
  mkdirSync(prof, { recursive: true });
  try { rmSync(prof + '/DevToolsActivePort'); } catch (e) {}
  const chrome = spawn(CHROME, [
    '--headless=new', '--hide-scrollbars', '--remote-debugging-port=0', '--user-data-dir=' + prof, '--window-size=1920,1080',
    '--no-first-run', '--disable-extensions', ...flags, 'about:blank',
  ], { stdio: 'ignore' });

  let port = null;
  for (let i = 0; i < 80 && !port; i++) {
    await sleep(250);
    try { port = readFileSync(prof + '/DevToolsActivePort', 'utf8').split('\n')[0].trim(); } catch (e) { port = null; }
  }
  if (!port) { console.error('Chrome did not start: ' + CHROME); chrome.kill(); process.exit(1); }
  const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));

  let id = 0;
  const pending = new Map();
  let loaded = null;
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
    if (d.method === 'Page.loadEventFired' && loaded) { loaded(); loaded = null; }
    onEvent?.(d);
  });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

  return {
    profileDir: prof,
    send,
    /** Evaluates an expression in the page and returns its value, or null if evaluation fails. */
    ev: async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null; },
    /** Resolves on the load event or after `timeout` ms, whichever comes first; never rejects. */
    navigate: async (url, timeout) => {
      const p = new Promise((r) => { loaded = r; });
      await send('Page.navigate', { url });
      await Promise.race([p, sleep(timeout)]);
    },
    close: () => { ws.close(); chrome.kill(); },
  };
}
