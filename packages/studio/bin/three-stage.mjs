#!/usr/bin/env node
// The three-stage command. Usage is in docs/getting-started.md; shot, measure and soak are in packages/studio/tools/README.md.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { publish } from '../server/publish.mjs';
import { publishCheck } from '../server/registered.mjs';
import { buildPackage } from '../server/build.mjs';
import { startStudio } from '../server/studio-server.mjs';
import { PROJECT_FILE, createProject, findPackage, projectNameFrom, readProject, writeLocalTsconfig } from '../server/project.mjs';

const studioDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TOOLS = { shot: 'cdp.mjs', measure: 'measure.mjs', soak: 'soak.mjs' };

const args = process.argv.slice(2);
const command = ['new', 'publish', 'build', 'typecheck', ...Object.keys(TOOLS)].includes(args[0]) ? args.shift() : 'studio';

if (TOOLS[command]) {
  const r = spawnSync(process.execPath, [join(studioDir, 'tools', TOOLS[command]), ...args], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const VALUE_OPTS = ['--port', '--scene', '--out', '--name', '--template'];
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUE_OPTS.includes(args[i - 1])));
const projectDir = resolve(positional[0] || process.cwd());

/**
 * Launches the app window as a separate process. In the installed app, three-stage.cmd sets THREE_STAGE_APP to the exe
 * and ELECTRON_RUN_AS_NODE, which must be removed or the exe runs as Node instead of opening a window.
 */
function launchApp(dir) {
  const [exe, pre] = process.env.THREE_STAGE_APP
    ? [process.env.THREE_STAGE_APP, []]
    : [createRequire(import.meta.url)('electron'), [join(studioDir, 'electron', 'main.mjs')]];
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(exe, [...pre, ...(dir ? [dir] : [])], { detached: true, stdio: 'ignore', env }).unref();
}

if (command === 'studio' && !flag('--no-open')) {
  if (positional[0] && !readProject(projectDir).ok) {
    console.error(`THREE Stage: ${projectDir} is not a project folder. It needs ${PROJECT_FILE}, src/stage.ts and content/`);
    process.exit(1);
  }
  launchApp(positional[0] ? projectDir : (readProject(projectDir).ok ? projectDir : null));
  process.exit(0);
}

if (command === 'new') {
  if (!positional[0]) {
    console.error('Usage: three-stage new <folder> [--name name] [--template empty|sample]');
    process.exit(1);
  }
  try {
    const p = createProject(projectDir, projectNameFrom(opt('--name', '') || positional[0].split(/[\\/]/).pop()), opt('--template', 'empty'));
    console.log(`Created project ${p.name}  ${projectDir}`);
    process.exit(0);
  } catch (e) {
    console.error('Cannot create the project: ' + e.message);
    process.exit(1);
  }
}

const project = readProject(projectDir);

if (!project.ok) {
  console.error(`THREE Stage: ${projectDir} is not a project folder. It needs ${PROJECT_FILE}, src/stage.ts and content/`);
  process.exit(1);
}

if (command === 'typecheck') {
  const tsconfig = writeLocalTsconfig(projectDir);
  const r = spawnSync(process.execPath, [join(findPackage('typescript'), 'bin', 'tsc'), '-p', tsconfig], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

if (command === 'publish') {
  const scene = opt('--scene', 'scenes/main.stage.json');
  const sceneFile = join(projectDir, 'content', scene);
  let assets = [];
  if (existsSync(sceneFile)) {
    let missing;
    try {
      ({ missing, assets } = await publishCheck({ projectDir, scene: JSON.parse(readFileSync(sceneFile, 'utf8')) }));
    } catch (e) {
      missing = [e.message];
    }
    if (missing.length) {
      for (const m of missing) console.error('Cannot publish: ' + m);
      process.exit(1);
    }
  }
  const r = publish({ projectDir, scene, outDir: opt('--out', undefined), assets });
  if (!r.ok) {
    for (const e of r.errors) console.error('Cannot publish: ' + e);
    process.exit(1);
  }
  console.log(`Published  ${relative(process.cwd(), r.outDir) || '.'}  ${r.files} files  ${(r.bytes / 1048576).toFixed(1)} MB`);
  process.exit(0);
}

if (command === 'build') {
  try {
    const r = await buildPackage({ projectDir });
    for (const w of r.warnings) console.warn('Warning: ' + w);
    console.log(`Built the package  ${relative(process.cwd(), r.tgz)}`);
    process.exit(0);
  } catch (e) {
    console.error('Cannot build the package: ' + e.message);
    process.exit(1);
  }
}

const { url } = await startStudio({ projectDir, port: Number(opt('--port', '5180')) });
console.log(`THREE Stage: opened ${project.name}  ${url}`);
console.log(`  Preview (the scene without the editor)  ${url}preview.html`);
