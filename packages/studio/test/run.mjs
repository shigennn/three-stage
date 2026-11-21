// All-elements test: runs a copy of fixture/, which uses every element the tool handles, through typecheck, Publish,
// build and the preview page in headless Chrome, the same path a host app's bundle takes.
// Usage: npm test from the repository root. CHROME_PATH sets Chrome (packages/studio/tools/README.md); TEST_GPU=1 renders
// on the GPU instead of SwiftShader; KEEP=1 keeps the work folder in the OS temp folder.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { list } from 'tar';
import { GPU_FLAGS, SWIFTSHADER_FLAGS, openChrome, sleep } from '../tools/chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'three-stage.mjs');
const SCENES = ['main', 'alt1', 'alt2', 'alt3'];
const work = mkdtempSync(join(tmpdir(), 'three-stage-test-'));
cpSync(join(here, 'fixture'), work, { recursive: true });

const results = [];
const check = (group, name, ok, detail = '') => results.push({ group, name, ok: !!ok, detail: String(detail) });
const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: work, encoding: 'utf8' });

{
  const r = cli('typecheck', work);
  check('types', 'three-stage typecheck', r.status === 0, (r.stdout + r.stderr).trim().split('\n').slice(-3).join(' '));
}

for (const s of SCENES) {
  const r = cli('publish', work, '--scene', `scenes/${s}.stage.json`, '--out', `dist/${s}`);
  check('Publish', `publishes ${s}`, r.status === 0, (r.stdout + r.stderr).trim());
}
{
  const m = JSON.parse(readFileSync(join(work, 'dist', 'main', 'manifest.json'), 'utf8'));
  const has = (p) => p in m.files && existsSync(join(work, 'dist', 'main', m.files[p]));
  check('Publish', 'includes files referenced by param defaults (tile.glb, stripes.png)', has('glb/tile.glb') && has('textures/stripes.png'));
  check('Publish', 'includes fonts/', has('fonts/Probe.ttf'));
  check('Publish', 'includes exr, hdr, ktx2 and compressed glb', ['hdr/dusk.exr', 'hdr/noon.hdr', 'textures/magenta.ktx2', 'glb/beacon-draco.glb', 'glb/beacon-meshopt.glb'].every(has));
  const dec = m.decoders ?? {};
  const decOk = (k, f) => dec[k] && existsSync(join(work, 'dist', 'main', dec[k], f));
  check('Publish', 'includes the Draco and Basis decoders', decOk('draco', 'draco_decoder.wasm') && decOk('basis', 'basis_transcoder.wasm'), JSON.stringify(dec));
  check('Publish', 'lists Events', ['hide:stage.listChange', 'levelUp:test.levelReached', 'notice:none'].every((e) => (m.events ?? []).some((x) => `${x.name}:${x.trigger}` === e)));
  const broken = JSON.parse(readFileSync(join(work, 'content', 'scenes', 'main.stage.json'), 'utf8'));
  broken.assets.push('glb/missing.glb');
  writeFileSync(join(work, 'content', 'scenes', 'broken.stage.json'), JSON.stringify(broken));
  const r = cli('publish', work, '--scene', 'scenes/broken.stage.json', '--out', 'dist/broken');
  check('Publish', 'stops on a missing asset', r.status !== 0 && !existsSync(join(work, 'dist', 'broken', 'manifest.json')), (r.stdout + r.stderr).trim().split('\n')[0]);
  rmSync(join(work, 'content', 'scenes', 'broken.stage.json'));
}

{
  const r = cli('build', work);
  check('build', 'creates the tgz', r.status === 0, (r.stdout + r.stderr).trim());
  const tgz = join(work, 'dist', 'all-elements-0.1.0.tgz');
  const entries = [];
  if (existsSync(tgz)) await list({ file: tgz, onReadEntry: (e) => entries.push(e.path) });
  const want = ['package/package.json', 'package/README.md', 'package/index.js', 'package/mock.js', 'package/types/index.d.ts', 'package/types/mock/index.d.ts'];
  check('build', 'includes entry points, types and README', want.every((w) => entries.includes(w)), want.filter((w) => !entries.includes(w)).join(', '));
  check('build', 'excludes types unreachable from the entry points (component internals)', !entries.some((e) => e.startsWith('package/types/components/')));
  const js = readdirSync(join(work, 'dist', 'package')).filter((f) => f.endsWith('.js'));
  const texts = js.map((f) => readFileSync(join(work, 'dist', 'package', f), 'utf8'));
  check('build', "JS starts with 'use client'", texts.every((t) => t.startsWith('"use client"') || t.startsWith("'use client'")));
  check('build', 'JS has no source-path comments left', !texts.some((t) => /\/\/ [^\n]*\.(tsx?|mjs)\n/.test(t)));
}

const server = spawn(process.execPath, [BIN, work, '--no-open', '--port', '5190'], { stdio: ['ignore', 'pipe', 'pipe'] });
let base = null;
server.stdout.on('data', (b) => (base ??= String(b).match(/(http:\/\/[^\s]+\/)\s/)?.[1] ?? null));
for (let i = 0; i < 240 && !base; i++) await sleep(250);
if (!base) {
  check('render', 'studio server starts', false);
  finish();
}

const logs = [];
// As root on Linux (e.g. CI containers), Chrome only starts without the sandbox
const noSandbox = process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : [];
const chrome = await openChrome(`test-${process.pid}`, [...(process.env.TEST_GPU === '1' ? GPU_FLAGS : SWIFTSHADER_FLAGS), ...noSandbox], (d) => {
  if (d.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 200));
  if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning'))
    logs.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200));
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') logs.push('log: ' + d.params.entry.text + ' ' + (d.params.entry.url ?? ''));
});
await chrome.send('Runtime.enable');
await chrome.send('Page.enable');
await chrome.send('Log.enable');
await chrome.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
// three.js dispatches 'observe' on window.__THREE_DEVTOOLS__ for each new Scene (the three.js devtools hook).
// 'Slots 2' is item B's object; its visibility is recorded every frame.
await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    window.__scenes = [];
    window.__THREE_DEVTOOLS__ = new EventTarget();
    window.__THREE_DEVTOOLS__.addEventListener('observe', (e) => { if (e.detail && e.detail.isScene) window.__scenes.push(e.detail); });
    window.__find = (name) => { let f = null; window.__scenes.forEach((s) => s.traverse((o) => { if (!f && o.name === name) f = o; })); return f; };
    // The Scene the runtime renders. Room Environment and the reflection probe also create Scenes, so pick the one holding kit.glb objects
    window.__stageScene = () => window.__scenes.find((s) => s.getObjectByName('Column'));
    window.__slotB = [];
    window.__notice = 0;
    window.__seen = {};
    const tick = () => {
      // Whether objects with Visible unchecked in the Inspector got shown (Door has a Track in the Play Timeline, Ghost in an Event)
      for (const n of ['Door', 'Ghost']) if (window.__find(n)?.visible) window.__seen[n] = true;
      const o = window.__find('Slots 2');
      if (o) window.__slotB.push(o.visible ? 1 : 0);
      const n = document.querySelector('[data-part="notice"]');
      if (n && getComputedStyle(n).visibility !== 'hidden') window.__notice = Math.max(window.__notice, +getComputedStyle(n).opacity);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })();`,
});

const waitFor = async (expr, ms) => {
  for (let t = 0; t < ms; t += 250) {
    if (await chrome.ev(expr)) return true;
    await sleep(250);
  }
  return false;
};
/** Takes the page warnings and errors collected so far, minus the R3F Clock warning and those matching `allow`. */
// R3F 9 uses THREE.Clock, which three.js 0.186 deprecated; the runtime itself does not use it.
const R3F_CLOCK = /THREE\.Clock: This module has been deprecated/;
const pageLogs = (allow = []) => logs.splice(0).filter((l) => ![R3F_CLOCK, ...allow].some((a) => a.test(l)));
const VSM = /a Point Light cannot cast shadows when the Shadow Map Type is VSM/;

async function openScene(label, query, allow) {
  logs.length = 0;
  await chrome.navigate(base + 'preview.html?quality=low&' + query, 20000);
  // Ready once components run, every glb has loaded and the reflection probe has baked. alt3 has environment None and never bakes.
  const ready = await waitFor(
    `(() => {
      const p = window.__probe, s = window.__stageScene();
      if (!p || !p.allParams || !p.slots || p.slots.length !== 3 || !s) return false;
      const meshes = (n) => { let c = 0; window.__find(n)?.traverse((o) => { if (o.isMesh) c++; }); return c; };
      if (!['Draco', 'Meshopt', 'Spinner', 'Hopper'].every((n) => meshes(n) > 0) || !p.allParams.follow) return false;
      return ${label === 'alt3'} || (s.environment?.userData?.probeBakes ?? 0) > 0;
    })()`,
    180000,
  );
  check(label, 'loads and components run', ready);
  return ready;
}

// Mock data from 00:30 at 2 min/s: level passes 70 at 00:32 (levelUp) and item B goes inactive at 01:00 (hide B).
if (await openScene('main', 'bundle=/dist/main/manifest.json&start=00:30&speed=120')) {
  const s = await chrome.ev(`(() => {
    const f = window.__find, m = (n) => f(n)?.material;
    const kids = (n) => { let c = 0; f(n)?.traverse((o) => { if (o.isMesh) c++; }); return c; };
    return {
      ktx2: !!m('Column')?.map?.image, crate: !!m('Crate')?.map?.image, orb: m('Orb')?.type, panel: m('Panel')?.type,
      draco: kids('Draco'), meshopt: kids('Meshopt'), ghost: f('Ghost')?.visible,
      font: window.__probe.font, all: window.__probe.allParams,
      env: !!window.__stageScene().environment, bakes: window.__stageScene().environment?.userData?.probeBakes ?? 0,
      fan: f('Fan')?.quaternion.toArray().join(','),
    };
  })()`);
  check('main', 'ktx2 texture', s.ktx2);
  check('main', 'png and jpg textures (the six standard maps)', s.crate);
  check('main', 'physical material', s.orb === 'MeshPhysicalMaterial', s.orb);
  check('main', 'vertex/fragment shader', s.panel === 'ShaderMaterial', s.panel);
  check('main', 'Draco and Meshopt glb', s.draco > 0 && s.meshopt > 0, `${s.draco} ${s.meshopt}`);
  check('main', 'objects with Visible unchecked in the Inspector are hidden outside Track ranges', s.ghost === false);
  check('main', 'font (2D UI loads it from content/)', s.font === 'loaded', s.font);
  const a = s.all;
  check('main', 'component params (object, node, material, texture)', a.follow === 'Orb' && a.anchor === 'Door' && a.skinApplied && a.decalLoaded && a.sharedGlow > 0, JSON.stringify({ follow: a.follow, anchor: a.anchor, skin: a.skinApplied, decal: a.decalLoaded }));
  check('main', 'bakes the reflection probe', s.env && s.bakes > 0, `bakes ${s.bakes}`);
  // The Clip stops while rendering stalls (e.g. shader compilation), so wait for a change rather than sampling once.
  check('main', 'override Clip (loop) plays', await waitFor(`window.__find('Fan').quaternion.toArray().join(',') !== ${JSON.stringify(s.fan)}`, 10000));
  const events = await waitFor(`window.__stage.played.some((p) => p.startsWith('hide B')) && window.__stage.played.some((p) => p.startsWith('levelUp'))`, 90000);
  check('main', 'List Change and a custom Trigger fire Events', events, await chrome.ev('window.__stage.played.join(" / ")'));
  // Item B must stay visible through the Event, then stay hidden by data. Any 1 -> 0 -> 1 at the Event start fails.
  await waitFor('window.__slotB.slice(-10).join("") === "0000000000"', 30000);
  const seq = (await chrome.ev('window.__slotB.join("")')) ?? '';
  check('main', 'object hidden by data does not vanish at the Event start', /^1+0+$/.test(seq), seq.replace(/(.)\1*/g, (r) => r[0] + 'x' + r.length + ' '));
  await chrome.ev(`window.__stage.events.fire('notice')`);
  check('main', 'fire plays an Event (2D UI)', await waitFor('window.__notice > 0', 10000));
  const spin = await waitFor(`(() => { let b = null; window.__find('Spinner')?.traverse((o) => { if (!b && o.name === 'Beacon') b = o; }); return b && b.position.y > 0.2; })()`, 10000);
  check('main', 'Event Animation Track plays', spin);
  check('main', 'objects with Visible unchecked appear within Event Track ranges', await waitFor('!!window.__seen.Ghost', 10000));
  check('main', 'objects with Visible unchecked appear within Play Timeline Track ranges', await waitFor('!!window.__seen.Door', 60000));
  const l = pageLogs([VSM]);
  check('main', 'no warnings or errors (except the one VSM Point Light warning)', l.length === 0, l.join(' | '));
}

const env = (q) => chrome.ev(`(() => { const s = window.__stageScene(); const b = s.background; return ${q}; })()`);
if (await openScene('alt1', 'bundle=/dist/alt1/manifest.json')) {
  check('alt1', 'background color, Room environment', (await env(`b && b.isColor && '#' + b.getHexString() === '#203040' && !!s.environment`)));
  const l = pageLogs();
  check('alt1', 'no warnings or errors', l.length === 0, l.join(' | '));
}
if (await openScene('alt2', 'bundle=/dist/alt2/manifest.json')) {
  check('alt2', 'no background, hdr environment', await env(`b === null && !!s.environment`));
  const l = pageLogs();
  check('alt2', 'no warnings or errors', l.length === 0, l.join(' | '));
}
if (await openScene('alt3', 'bundle=/dist/alt3/manifest.json')) {
  check('alt3', 'environment None uses no probe either', await env(`s.environment === null`));
  const l = pageLogs([VSM]);
  check('alt3', 'no warnings or errors', l.length === 0, l.join(' | '));
}
// Loads from content/ without a bundle, as the studio Viewport does; the studio server serves the decoders.
if (await openScene('content', 'scene=scenes/main.stage.json')) {
  const s = await chrome.ev(`(() => { let n = 0; window.__find('Draco')?.traverse((o) => { if (o.isMesh) n++; }); return { ktx2: !!window.__find('Column')?.material?.map?.image, draco: n }; })()`);
  check('content', 'ktx2 and Draco', s.ktx2 && s.draco > 0, JSON.stringify(s));
  const l = pageLogs([VSM]);
  check('content', 'no warnings or errors', l.length === 0, l.join(' | '));
}

chrome.close();
finish();

function finish() {
  server.kill();
  let group = '';
  for (const r of results) {
    if (r.group !== group) console.log(`\n${(group = r.group)}`);
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : '  ' + r.detail}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} / ${results.length} passed`);
  if (process.env.KEEP === '1') console.log('work folder  ' + work);
  else rmSync(work, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
