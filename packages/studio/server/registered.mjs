// Runs the runtime's publishCheck against the registrations the built package includes. The studio page also holds
// registrations that only src/stage.ts imports, so both the studio's Publish and `three-stage publish` check here,
// loading the project's code into Node with Vite.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPackage, LOCAL_DIR, readProject, sharedPackages } from './project.mjs';
import { publish } from './publish.mjs';

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

/**
 * Checks the registrations, then publishes. A scene file that is missing or not JSON is reported by publish().
 * @param {{ projectDir: string, scene: string, outDir?: string }} opts
 * @returns {Promise<ReturnType<typeof publish>>}
 */
export async function checkAndPublish({ projectDir, scene, outDir }) {
  const sceneFile = join(projectDir, 'content', scene);
  let assets = [];
  if (existsSync(sceneFile)) {
    let def = null;
    try {
      def = JSON.parse(readFileSync(sceneFile, 'utf8'));
    } catch {}
    if (def) {
      let missing;
      try {
        ({ missing, assets } = await publishCheck({ projectDir, scene: def }));
      } catch (e) {
        missing = [e.message];
      }
      if (missing.length) return { ok: false, outDir: resolve(outDir ?? join(projectDir, 'dist', 'bundle')), files: 0, bytes: 0, errors: missing };
    }
  }
  return publish({ projectDir, scene, outDir, assets });
}
