// Starts the studio's dev server for one project. Used by both the three-stage command and the app window (electron/main.mjs).
import { createServer, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stagePlugin } from './plugin.mjs';
import { LOCAL_DIR, readProject, sharedPackages, writeLocalTsconfig } from './project.mjs';

const studioDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(studioDir, 'app');

/** @param {{ projectDir: string, port?: number }} opts */
export async function startStudio({ projectDir, port = 5180 }) {
  const project = readProject(projectDir);
  if (!project.ok) throw new Error(`${projectDir} is not a project folder`);
  writeLocalTsconfig(projectDir);
  const server = await createServer({
    configFile: false,
    root: appDir,
    cacheDir: join(projectDir, LOCAL_DIR, 'vite'),
    clearScreen: false,
    plugins: [react(), stagePlugin({ projectDir, entry: project.entry, name: project.name })],
    // Projects have no node_modules; dedupe makes the project's imports resolve from the tool (root)
    resolve: { dedupe: sharedPackages() },
    optimizeDeps: {
      entries: [join(appDir, 'index.html'), join(appDir, 'preview.html'), project.entry],
      // The cache is per project, so a dependency missing from this list is discovered on each project's first open and forces a page reload
      include: [
        'react',
        'react-dom/client',
        'react/jsx-runtime',
        'three',
        '@react-three/fiber',
        '@react-three/drei',
        'zustand',
        'immer',
        'three/examples/jsm/controls/TransformControls.js',
        'three/examples/jsm/environments/RoomEnvironment.js',
        'three/examples/jsm/loaders/EXRLoader.js',
        'three/examples/jsm/loaders/HDRLoader.js',
        'three/examples/jsm/loaders/KTX2Loader.js',
        'three/examples/jsm/postprocessing/EffectComposer.js',
        'three/examples/jsm/postprocessing/FXAAPass.js',
        'three/examples/jsm/postprocessing/OutputPass.js',
        'three/examples/jsm/postprocessing/Pass.js',
        'three/examples/jsm/postprocessing/RenderPass.js',
        'three/examples/jsm/postprocessing/SMAAPass.js',
        'three/examples/jsm/postprocessing/ShaderPass.js',
        'three/examples/jsm/postprocessing/UnrealBloomPass.js',
        'three/examples/jsm/utils/SkeletonUtils.js',
      ],
    },
    server: {
      host: '127.0.0.1',
      port,
      strictPort: false,
      fs: { allow: [projectDir, studioDir, searchForWorkspaceRoot(projectDir), searchForWorkspaceRoot(studioDir)] },
    },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0] ?? `http://127.0.0.1:${port}/`;
  return { server, url, project };
}
