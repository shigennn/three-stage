// Vite plugin that adds the studio's project endpoints (/content/, /dist/, /@stage/*) and content/ file watching to the dev server.
import { createReadStream, existsSync, mkdirSync, statSync, readdirSync, writeFileSync, openSync, readSync, closeSync, watchFile, unwatchFile } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, relative, resolve, extname, basename, isAbsolute } from 'node:path';
import { DECODERS, publish } from './publish.mjs';
import { findPackage, slash } from './project.mjs';
import { gitCheckout, gitCreate, gitFetch, gitHeadFile, gitStatus } from './git.mjs';

const VIRTUAL = 'virtual:three-stage/project';
const RESOLVED = '\0three-stage-project';

const MIME = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ktx2': 'image/ktx2',
  '.hdr': 'application/octet-stream',
  '.exr': 'application/octet-stream',
  '.webp': 'image/webp',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
};

/** Files added from Explorer go into the folder that matches their extension */
export const IMPORT_FOLDERS = {
  '.glb': 'glb',
  '.png': 'textures',
  '.jpg': 'textures',
  '.jpeg': 'textures',
  '.ktx2': 'textures',
  '.webp': 'textures',
  '.hdr': 'hdr',
  '.exr': 'hdr',
};

function inside(dir, p) {
  const r = relative(dir, p);
  return !!r && !r.startsWith('..') && !isAbsolute(r);
}

/** Reads only the JSON chunk of a glb and counts its triangles (node instances are not counted) */
function glbTriangles(file) {
  try {
    const fd = openSync(file, 'r');
    const head = Buffer.alloc(20);
    readSync(fd, head, 0, 20, 0);
    if (head.readUInt32LE(0) !== 0x46546c67) {
      closeSync(fd);
      return null;
    }
    const len = head.readUInt32LE(12);
    const json = Buffer.alloc(len);
    readSync(fd, json, 0, len, 20);
    closeSync(fd);
    const g = JSON.parse(json.toString('utf8'));
    let tris = 0;
    for (const m of g.meshes || []) {
      for (const p of m.primitives || []) {
        if (p.mode !== undefined && p.mode !== 4) continue;
        const acc = g.accessors?.[p.indices ?? p.attributes?.POSITION];
        if (acc) tris += acc.count / 3;
      }
    }
    return Math.round(tris);
  } catch {
    return null;
  }
}

function listFiles(contentDir) {
  const out = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const st = statSync(p);
        const f = { path: slash(relative(contentDir, p)), size: st.size, mtime: Math.round(st.mtimeMs) };
        if (extname(e.name).toLowerCase() === '.glb') f.triangles = glbTriangles(p);
        out.push(f);
      }
    }
  };
  walk(contentDir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function readBody(req, limit = 512 * 1024 * 1024) {
  return new Promise((res, rej) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) {
        rej(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => res(Buffer.concat(chunks)));
    req.on('error', rej);
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Sends a file with the content type for its extension. content/ changes, so by default it is not cached */
function sendFile(req, res, p, cache = 'no-store') {
  res.setHeader('Content-Type', MIME[extname(p).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', cache);
  res.setHeader('Content-Length', statSync(p).size);
  if (req.method === 'HEAD') return res.end();
  return createReadStream(p).pipe(res);
}

export function stagePlugin({ projectDir, entry, name }) {
  // The decoders come from the tool's three.js, so they don't change while the server runs
  let threeDir = null;
  const contentDir = join(projectDir, 'content');
  const distDir = join(projectDir, 'dist');

  return {
    name: 'three-stage',
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED;
    },
    load(id) {
      if (id !== RESOLVED) return;
      return `import ${JSON.stringify(slash(entry))};\nexport const project = ${JSON.stringify({ name, dir: slash(projectDir) })};\n`;
    },
    handleHotUpdate({ file }) {
      if (inside(contentDir, resolve(file))) return [];
    },
    configureServer(server) {
      server.watcher.add(contentDir);
      const notify = (event) => (file) => {
        const abs = resolve(file);
        if (!inside(contentDir, abs)) return;
        let mtime = 0;
        try {
          mtime = Math.round(statSync(abs).mtimeMs);
        } catch {}
        server.ws.send({ type: 'custom', event: 'stage:files', data: { event, path: slash(relative(contentDir, abs)), mtime } });
      };
      server.watcher.on('add', notify('add'));
      server.watcher.on('change', notify('change'));
      server.watcher.on('unlink', notify('unlink'));

      // Tells the Toolbar about branch switches made outside the studio. Vite's watcher ignores .git, so HEAD is watched separately
      const head = gitHeadFile(projectDir);
      if (head) {
        const onHead = () => server.ws.send({ type: 'custom', event: 'stage:git', data: {} });
        watchFile(head, { interval: 1000 }, onHead);
        server.httpServer?.once('close', () => unwatchFile(head, onHead));
      }

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://x');
        // Do not let a POST from another site's page modify files
        if (req.method === 'POST' && url.pathname.startsWith('/@stage/')) {
          const origin = req.headers.origin;
          if (!origin || origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'Can only be called from the studio' });
        }
        try {
          // The three.js decoders for compressed glb files and KTX2 textures. A scene bundle carries its own copy (Publish)
          const decoder = url.pathname.match(/^\/@stage\/decoders\/(draco|basis)\/([^/]+)$/);
          if (decoder && (req.method === 'GET' || req.method === 'HEAD')) {
            const d = DECODERS[decoder[1]];
            if (!d.files.includes(decoder[2])) return send(res, 404, { error: 'not found' });
            threeDir ??= findPackage('three');
            return sendFile(req, res, join(threeDir, d.dir, decoder[2]), 'max-age=86400');
          }
          // /dist/ serves the published bundle to the preview page (preview.html?bundle=)
          const served = url.pathname.startsWith('/content/') ? contentDir : url.pathname.startsWith('/dist/') ? distDir : null;
          if (served && (req.method === 'GET' || req.method === 'HEAD')) {
            const p = resolve(served, decodeURIComponent(url.pathname.slice(url.pathname.indexOf('/', 1) + 1)));
            if (!inside(served, p) || !existsSync(p) || !statSync(p).isFile()) return send(res, 404, { error: 'not found' });
            return sendFile(req, res, p);
          }
          if (url.pathname === '/@stage/files' && req.method === 'GET') {
            return send(res, 200, { project: { name, dir: slash(projectDir) }, files: listFiles(contentDir) });
          }
          if ((url.pathname === '/@stage/save' || url.pathname === '/@stage/import') && req.method === 'POST') {
            const g = gitStatus(projectDir);
            if (g.repo && g.readOnly) return send(res, 403, { error: `${g.branch} is read-only. Create or select a branch before saving` });
          }
          if (url.pathname === '/@stage/save' && req.method === 'POST') {
            const { path, text } = JSON.parse((await readBody(req, 64 * 1024 * 1024)).toString('utf8'));
            const p = resolve(contentDir, path);
            if (!inside(join(contentDir, 'scenes'), p) || !p.endsWith('.stage.json')) return send(res, 400, { error: 'Only scenes/*.stage.json can be saved' });
            mkdirSync(join(p, '..'), { recursive: true });
            writeFileSync(p, text, 'utf8');
            return send(res, 200, { ok: true, mtime: Math.round(statSync(p).mtimeMs) });
          }
          if (url.pathname === '/@stage/publish' && req.method === 'POST') {
            const { scene, assets } = JSON.parse((await readBody(req)).toString('utf8'));
            const r = publish({ projectDir, scene, assets });
            return send(res, 200, { ...r, outDir: slash(relative(projectDir, r.outDir)) });
          }
          if (url.pathname === '/@stage/import' && req.method === 'POST') {
            const file = basename(url.searchParams.get('name') || '');
            const folder = IMPORT_FOLDERS[extname(file).toLowerCase()];
            if (!file || !folder) return send(res, 400, { error: `Cannot import ${file}: unsupported file type` });
            const p = join(contentDir, folder, file);
            if (existsSync(p) && url.searchParams.get('overwrite') !== '1') return send(res, 409, { exists: true, path: `${folder}/${file}` });
            mkdirSync(join(contentDir, folder), { recursive: true });
            writeFileSync(p, await readBody(req));
            return send(res, 200, { ok: true, path: `${folder}/${file}` });
          }
          if (url.pathname === '/@stage/git' && req.method === 'GET') {
            return send(res, 200, gitStatus(projectDir));
          }
          if (url.pathname === '/@stage/git/fetch' && req.method === 'POST') {
            gitFetch(projectDir);
            return send(res, 200, gitStatus(projectDir));
          }
          if (url.pathname === '/@stage/git/checkout' && req.method === 'POST') {
            const { branch } = JSON.parse((await readBody(req)).toString('utf8'));
            return send(res, 200, gitCheckout(projectDir, String(branch)));
          }
          if (url.pathname === '/@stage/git/create' && req.method === 'POST') {
            const { name } = JSON.parse((await readBody(req)).toString('utf8'));
            gitCreate(projectDir, name);
            return send(res, 200, { ok: true });
          }
          if (url.pathname === '/@stage/reveal' && req.method === 'POST') {
            const { path } = JSON.parse((await readBody(req)).toString('utf8'));
            const p = resolve(contentDir, path || '.');
            if (!(p === contentDir || inside(contentDir, p))) return send(res, 400, { error: 'Cannot open anything outside content/' });
            if (process.platform === 'win32') spawn('explorer.exe', [p === contentDir ? p : `/select,${p}`], { detached: true, stdio: 'ignore' }).unref();
            return send(res, 200, { ok: true });
          }
        } catch (e) {
          return send(res, 500, { error: String(e && e.message ? e.message : e) });
        }
        next();
      });
    },
  };
}
