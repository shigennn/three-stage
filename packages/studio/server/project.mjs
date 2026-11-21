// The shape of a project folder: three-stage.json, src/stage.ts and content/, with no node_modules.
// The runtime, React and three.js that the project's src imports come from the tool.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_FILE = 'three-stage.json';
/** Per-machine files inside the project (tsconfig, Vite caches). The template's .gitignore excludes it */
export const LOCAL_DIR = '.three-stage';

const studioDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const slash = (p) => p.split(sep).join('/');

/** The folder of a package in the tool's node_modules. Workspace links are resolved to the real folder */
export function findPackage(name) {
  let d = studioDir;
  for (;;) {
    const p = join(d, 'node_modules', name);
    if (existsSync(join(p, 'package.json'))) return realpathSync(p);
    if (dirname(d) === d) throw new Error(`${name} was not found in the tool`);
    d = dirname(d);
  }
}

const runtimePkg = () => JSON.parse(readFileSync(join(findPackage('@three-stage/runtime'), 'package.json'), 'utf8'));

/** Packages the host app provides. Not bundled into the package; listed in peerDependencies */
export function peerDependencies() {
  return runtimePkg().peerDependencies;
}

/** Packages the project's src may import. All are provided by the tool */
export function sharedPackages() {
  return [...Object.keys(peerDependencies()), '@three-stage/runtime'];
}

export function toolVersion() {
  return JSON.parse(readFileSync(join(studioDir, 'package.json'), 'utf8')).version;
}

export function readProject(projectDir) {
  const file = join(projectDir, PROJECT_FILE);
  const meta = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const entry = ['src/stage.ts', 'src/stage.tsx', 'src/stage.js'].map((e) => join(projectDir, e)).find((e) => existsSync(e));
  return {
    ok: !!meta && !!entry && existsSync(join(projectDir, 'content')),
    name: meta?.name || basename(projectDir),
    version: meta?.version || '0.1.0',
    description: meta?.description || '',
    tool: meta?.tool,
    entry,
  };
}

/** Reduces text to a valid package name (lowercase letters, digits, '.', '_' and '-') */
export function projectNameFrom(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[-._]+|[-._]+$/g, '') || 'stage-project'
  );
}

/** Templates offered for a new project. The chosen template folder is layered over template/common */
export const TEMPLATES = ['empty', 'sample'];

/** Creates a new project by copying a template (template/). Refuses a folder that is not empty */
export function createProject(projectDir, name = projectNameFrom(basename(projectDir)), template = 'empty') {
  if (!TEMPLATES.includes(template)) throw new Error(`There is no template ${template}. Choose one of: ${TEMPLATES.join(', ')}`);
  if (existsSync(projectDir) && readdirSync(projectDir).length) throw new Error(`${projectDir} is not empty`);
  cpSync(join(studioDir, 'template', 'common'), projectDir, { recursive: true });
  cpSync(join(studioDir, 'template', template), projectDir, { recursive: true });
  // npm drops .gitignore when packing, so the template keeps it under another name
  renameSync(join(projectDir, '_gitignore'), join(projectDir, '.gitignore'));
  for (const d of ['glb', 'textures', 'hdr']) mkdirSync(join(projectDir, 'content', d), { recursive: true });
  const file = join(projectDir, PROJECT_FILE);
  const meta = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...meta, name, tool: toolVersion() }, null, 2) + '\n');
  writeLocalTsconfig(projectDir);
  return readProject(projectDir);
}

/**
 * Writes .three-stage/tsconfig.json for type checking and editor completion.
 * It holds absolute paths into the tool, so it is per machine and must not be committed.
 */
export function writeLocalTsconfig(projectDir) {
  const nm = dirname(findPackage('react'));
  const dir = join(projectDir, LOCAL_DIR);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'tsconfig.json');
  writeFileSync(
    file,
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2023', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          allowImportingTsExtensions: true,
          isolatedModules: true,
          resolveJsonModule: true,
          types: [],
          paths: {
            // Point through node_modules. With the real folder, type emission treats the runtime as project source and fails because it is outside rootDir
            '@three-stage/runtime': [slash(join(nm, '@three-stage', 'runtime', 'src', 'index.ts'))],
            // The first match wins, and matching the untyped package (react/index.js) would stop there, so @types comes first
            '*': [slash(join(nm, '@types')) + '/*', slash(nm) + '/*'],
          },
        },
        include: ['../src'],
      },
      null,
      2,
    ) + '\n',
  );
  return file;
}
