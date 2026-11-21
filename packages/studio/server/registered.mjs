// Runs the runtime's publishCheck for `three-stage publish`. The command has no page holding the registrations,
// so it loads the project's code into Node with Vite to collect them.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPackage, LOCAL_DIR, readProject, sharedPackages } from './project.mjs';

const appDir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'app');

/**
 * @param {{ projectDir: string, scene: object }} opts scene is the scene definition JSON as read from the file (not normalized)
 * @returns {Promise<{ missing: string[], assets: string[] }>} Publish may proceed when missing is empty; pass assets to publish()
 */
export async function publishCheck({ projectDir, scene }) {
  const project = readProject(projectDir);
  const runtimeEntry = join(findPackage('@three-stage/runtime'), 'src', 'index.ts');
  const server = await createServer({
    configFile: false,
    // Projects have no node_modules; resolve their imports from the tool, as the studio's dev server does
    root: appDir,
    cacheDir: join(projectDir, LOCAL_DIR, 'vite-check'),
    logLevel: 'error',
    appType: 'custom',
    plugins: [react()],
    resolve: { dedupe: sharedPackages(), alias: [{ find: /^@three-stage\/runtime$/, replacement: runtimeEntry }] },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  // A drei dependency loads three with require, which makes Node print a deprecation warning
  const quiet = process.noDeprecation;
  process.noDeprecation = true;
  try {
    // Load the runtime first, from the same module the project imports, so both share one registry
    const runtime = await server.ssrLoadModule(runtimeEntry);
    // Check the registrations the built package includes (src/index.ts); without it, fall back to the studio entry
    const pkgEntry = join(projectDir, 'src', 'index.ts');
    const entry = existsSync(pkgEntry) ? pkgEntry : project.entry;
    try {
      await server.ssrLoadModule(entry);
    } catch (e) {
      throw new Error(`Cannot check registrations because the project code (${entry}) failed to load: ${e?.message ?? e}`);
    }
    return runtime.publishCheck(runtime.normalizeScene(scene), (p) => existsSync(join(projectDir, 'content', p)));
  } finally {
    process.noDeprecation = quiet;
    await server.close();
  }
}
