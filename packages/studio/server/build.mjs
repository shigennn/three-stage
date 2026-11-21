// `three-stage build`: bundles src/index.ts (and src/mock/index.ts) with the runtime into an ESM package with .d.ts types,
// README.md and package.json, packed into a tgz the way npm pack does. Don't call npm: the installed app has none.
// Peer packages (react and so on) stay external; a second copy of React in the host app breaks hooks.
// The output must not contain file paths from the machine that built it.
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { create as createTar } from 'tar';
import { findPackage, LOCAL_DIR, peerDependencies, readProject, slash, writeLocalTsconfig } from './project.mjs';

/** The type file a relative import points to. Resolves './data', './data.js', './util.mjs' (.d.mts), and '.' or './dir' (index.d.ts) */
function typeFile(from, spec) {
  const p = resolve(dirname(from), spec);
  const base = p.replace(/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/, '');
  return [base + '.d.ts', base + '.d.mts', base + '.d.cts', join(p, 'index.d.ts')].find((f) => existsSync(f));
}

/** Relative path references inside a type file (import, export, import(), /// <reference path>) */
const RELATIVE_REF = /\b(?:from|import)\s*\(?\s*['"](\.{1,2}(?:\/[^'"]*)?)['"]|<reference\s+path\s*=\s*['"]([^'"]+)['"]/g;

/** Type files reachable from the entry .d.ts files through relative references → whether each references the runtime's types */
function reachableTypes(typesDir, entryTypes) {
  const found = new Map();
  const visit = (file) => {
    if (!file || found.has(file) || !existsSync(file)) return;
    const text = readFileSync(file, 'utf8');
    found.set(file, text.includes('@three-stage/runtime'));
    for (const [, spec, ref] of text.matchAll(RELATIVE_REF)) visit(ref ? resolve(dirname(file), ref) : typeFile(file, spec));
  };
  for (const e of entryTypes) visit(join(typesDir, e));
  return found;
}

/** Deletes unreachable .d.ts files, and folders left empty */
function pruneTypes(dir, keep) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      pruneTypes(p, keep);
      if (!readdirSync(p).length) rmSync(p, { recursive: true });
    } else if (!keep.has(p)) rmSync(p);
  }
}

/** The tgz file name. Like npm pack, a scoped name (@acme/stage) becomes acme-stage */
const tgzName = (project) => `${project.name.replace(/^@/, '').replace('/', '-')}-${project.version}.tgz`;

/** The package's README.md. Covers only what is the same for every host app */
function readme(project, exports, peerDeps) {
  const peers = Object.entries(peerDeps).map(([n, v]) => `${n}@"${v}"`);
  const rows = Object.keys(exports).map((k) => {
    const name = k === '.' ? project.name : `${project.name}/${k.slice(2)}`;
    const types = exports[k].types.slice(2);
    return `| \`${name}\` | \`${types}\` |`;
  });
  return [
    `# ${project.name}`,
    '',
    ...(project.description ? [project.description, ''] : []),
    `3D components built with THREE Stage (${project.version}).`,
    '',
    '## Install',
    '',
    'Install this package and the packages the host app provides (peerDependencies).',
    '',
    '```bash',
    `npm install ./${tgzName(project)} ${peers.join(' ')}`,
    '```',
    '',
    '## Use',
    '',
    '| import | Types |',
    '|---|---|',
    ...rows,
    '',
    'The component props and the shape of the data to pass in are documented in the types.',
    'The components run only in the browser, so the output starts with `\'use client\'`.',
    '',
    '## Scene bundle',
    '',
    'The scene the components draw is delivered separately from this package (the folder the studio\'s Publish creates).',
    '',
    '1. Put the folder\'s contents, with the layout unchanged, on a host for static files or a CDN.',
    '2. Pass the URL of its `manifest.json` to the component.',
    '3. Do not cache `manifest.json`. The other files have a content hash in their names, so they can be cached for a long time.',
    '',
    'The scene\'s Event names are listed under `events` in `manifest.json`.',
    '',
  ].join('\n');
}

/** @param {{ projectDir: string }} opts */
export async function buildPackage({ projectDir }) {
  const project = readProject(projectDir);
  const peerDeps = peerDependencies();
  const peers = Object.keys(peerDeps);
  const entries = { index: join(projectDir, 'src', 'index.ts') };
  if (!existsSync(entries.index)) throw new Error('src/index.ts is missing. Export the components for the host app from it');
  const mock = join(projectDir, 'src', 'mock', 'index.ts');
  if (existsSync(mock)) entries.mock = mock;

  const out = join(projectDir, 'dist', 'package');
  rmSync(out, { recursive: true, force: true });
  await build({
    configFile: false,
    root: projectDir,
    cacheDir: join(projectDir, LOCAL_DIR, 'vite-build'),
    logLevel: 'warn',
    plugins: [react()],
    resolve: { alias: [{ find: /^@three-stage\/runtime$/, replacement: join(findPackage('@three-stage/runtime'), 'src', 'index.ts') }] },
    build: {
      outDir: out,
      emptyOutDir: false,
      minify: true,
      sourcemap: false,
      lib: { entry: entries, formats: ['es'], fileName: (_, name) => `${name}.js` },
      rollupOptions: {
        external: (id) => peers.some((p) => id === p || id.startsWith(p + '/')),
        // banner: 'use client' keeps the Next.js App Router from rendering on the server. Bundling drops the directive, so it is added back.
        // chunkFileNames: not named after their first module, and .js like the entries (without a package.json in the project Vite uses .mjs).
        // minify: build.minify alone leaves line breaks and comments (module file paths) in a library's ES output.
        output: { banner: "'use client';", chunkFileNames: 'chunk-[hash].js', minify: true },
        onwarn(w, warn) {
          if (w.code === 'MODULE_LEVEL_DIRECTIVE') return;
          warn(w);
        },
      },
    },
  });

  const base = writeLocalTsconfig(projectDir);
  const tsconfig = join(out, 'tsconfig.types.json');
  writeFileSync(
    tsconfig,
    JSON.stringify({
      extends: slash(relative(out, base)),
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        rootDir: slash(relative(out, join(projectDir, 'src'))),
        outDir: './types',
      },
      include: [],
      files: Object.values(entries).map((e) => slash(relative(out, e))),
    }),
  );
  const r = spawnSync(process.execPath, [join(findPackage('typescript'), 'bin', 'tsc'), '-p', tsconfig], { stdio: 'inherit' });
  rmSync(tsconfig);
  if (r.status !== 0) throw new Error('Failed to emit the types');
  // The host app's type check never reads .d.ts files unreachable from the entries, so they are left out
  const typesDir = join(out, 'types');
  const entryTypes = Object.keys(entries).map((n) => (n === 'index' ? 'index.d.ts' : `${n}/index.d.ts`));
  const types = reachableTypes(typesDir, entryTypes);
  pruneTypes(typesDir, types);
  // The host app does not get the runtime package, so types that reference it can't resolve (with skipLibCheck they silently become any)
  const warnings = [...types]
    .filter(([, runtimeRef]) => runtimeRef)
    .map(([f]) => `types/${slash(relative(typesDir, f))} references the runtime's types, which the host app cannot read. Write the types of everything exported from the entry inside the project`)
    .sort();

  const exports = { '.': { types: './types/index.d.ts', import: './index.js' } };
  if (entries.mock) exports['./mock'] = { types: './types/mock/index.d.ts', import: './mock.js' };
  writeFileSync(join(out, 'README.md'), readme(project, exports, peerDeps));
  writeFileSync(
    join(out, 'package.json'),
    JSON.stringify({ name: project.name, version: project.version, description: project.description, type: 'module', exports, peerDependencies: peerDeps }, null, 2) + '\n',
  );
  mkdirSync(join(projectDir, 'dist'), { recursive: true });
  const tgz = join(projectDir, 'dist', tgzName(project));
  const files = readdirSync(out, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => slash(relative(out, join(e.parentPath, e.name))))
    .sort();
  await createTar({ gzip: true, file: tgz, cwd: out, prefix: 'package', portable: true }, files);
  return { out, tgz, warnings };
}
