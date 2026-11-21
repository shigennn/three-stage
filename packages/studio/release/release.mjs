// Builds the Windows installer (`npm run release` at the repository root).
// The tool is gathered into dist/release/studio, installed there with npm, and copied into the exe's resources/studio by this script.
// Don't let electron-builder copy it: as `app`, its default excludes drop node_modules/three/examples (three.js loaders and
// post-processing); as extraResources, node_modules is dropped entirely.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const releaseDir = dirname(fileURLToPath(import.meta.url));
const studioDir = resolve(releaseDir, '..');
const repo = resolve(studioDir, '..', '..');
const runtimeDir = join(repo, 'packages', 'runtime');
const out = join(repo, 'dist', 'release');
const stage = join(out, 'studio');
const launcher = join(out, 'app');

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const studioPkg = json(join(studioDir, 'package.json'));
const rootPkg = json(join(repo, 'package.json'));
const lock = json(join(repo, 'package-lock.json'));
/** The version in package-lock.json, so the installer gets the versions that were tested */
const installed = (name) => lock.packages[`node_modules/${name}`]?.version;

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
}

rmSync(out, { recursive: true, force: true });

mkdirSync(stage, { recursive: true });
for (const d of ['app', 'bin', 'server', 'electron', 'template', 'tools']) cpSync(join(studioDir, d), join(stage, d), { recursive: true });
cpSync(runtimeDir, join(stage, 'runtime'), { recursive: true, filter: (p) => !p.includes('node_modules') });
// The docs are included so they can be read where the app is installed
cpSync(join(repo, 'docs'), join(stage, 'docs'), { recursive: true });
const deps = {};
for (const name of Object.keys(studioPkg.dependencies)) deps[name] = name === '@three-stage/runtime' ? 'file:./runtime' : (installed(name) ?? studioPkg.dependencies[name]);
// Used to type-check projects and to emit the package types
for (const name of ['typescript', '@types/react', '@types/react-dom', '@types/three']) deps[name] = installed(name) ?? rootPkg.devDependencies[name];
writeFileSync(
  join(stage, 'package.json'),
  JSON.stringify({ name: '@three-stage/studio', version: studioPkg.version, private: true, type: 'module', dependencies: deps }, null, 2) + '\n',
);
// --install-links puts the runtime into node_modules as a real folder instead of a link
run('npm', ['install', '--omit=dev', '--install-links', '--no-audit', '--no-fund'], stage);

// The exe's entry point. It only loads electron/main.mjs from resources/studio
mkdirSync(launcher, { recursive: true });
writeFileSync(
  join(launcher, 'package.json'),
  JSON.stringify({ name: 'three-stage', productName: 'THREE Stage', version: studioPkg.version, description: 'THREE Stage', author: 'THREE Stage', type: 'module', main: 'launcher.mjs' }, null, 2) + '\n',
);
writeFileSync(
  join(launcher, 'launcher.mjs'),
  "import { join } from 'node:path';\nimport { pathToFileURL } from 'node:url';\n\nawait import(pathToFileURL(join(process.resourcesPath, 'studio', 'electron', 'main.mjs')).href);\n",
);

const config = {
  appId: 'io.three-stage.studio',
  productName: 'THREE Stage',
  electronVersion: installed('electron'),
  directories: { app: launcher, output: join(out, 'dist') },
  asar: false,
  npmRebuild: false,
  extraResources: [{ from: join(releaseDir, 'three-stage.cmd'), to: 'bin/three-stage.cmd' }],
  win: { target: ['nsis'], icon: join(studioDir, 'electron', 'icon.png') },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, artifactName: 'THREE-Stage-Setup-${version}.${ext}' },
};
const configFile = join(out, 'builder.json');
writeFileSync(configFile, JSON.stringify(config, null, 2));
const builder = join(repo, 'node_modules', '.bin', 'electron-builder');
// --publish never: when the npm script is named release, electron-builder also tries to upload to GitHub by default
run(builder, ['--win', '--dir', '--publish', 'never', '--config', configFile], repo);
const unpacked = join(out, 'dist', 'win-unpacked');
cpSync(stage, join(unpacked, 'resources', 'studio'), { recursive: true });
run(builder, ['--win', '--publish', 'never', '--config', configFile, '--prepackaged', unpacked], repo);
console.log(`Built  ${join(out, 'dist')}`);
