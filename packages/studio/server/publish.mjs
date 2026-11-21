// Publish. Writes the scene definition and the content/ files it uses with a content hash in their names, plus manifest.json.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { findPackage, slash } from './project.mjs';
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);

function hashedName(path, buf) {
  const ext = extname(path);
  const dir = dirname(path);
  const name = `${basename(path, ext)}.${hash(buf)}${ext}`;
  return dir === '.' ? name : `${dir}/${name}`;
}

function filesUnder(dir, contentDir, out) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) filesUnder(p, contentDir, out);
    else if (!e.name.startsWith('.')) {
      const rel = slash(relative(contentDir, p));
      out.set(rel, rel);
    }
  }
}

/** If v points to a file in content/ outside scenes/, its path inside content/; otherwise null */
function contentFile(contentDir, v) {
  if (typeof v !== 'string' || !v) return null;
  const p = resolve(contentDir, v);
  if (!p.startsWith(contentDir + sep) || !existsSync(p) || !statSync(p).isFile()) return null;
  const rel = slash(relative(contentDir, p));
  return rel.startsWith('scenes/') ? null : rel;
}

/**
 * Returns [manifest key, path inside content/] for every content/ file the scene definition or assets names, plus all of fonts/
 * (the 2D UI reads fonts without naming them in the scene).
 * The runtime looks files up by the string exactly as written, so both that string and the normalized path are keys.
 */
function referencedFiles(scene, contentDir, assets) {
  const out = new Map();
  filesUnder(join(contentDir, 'fonts'), contentDir, out);
  const walk = (v) => {
    if (typeof v === 'string') {
      const rel = contentFile(contentDir, v);
      if (rel) out.set(rel, rel).set(v, rel);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(scene);
  walk(assets);
  return [...out].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The glTF extensions a glb uses (extensionsUsed). Empty if not a glb */
function glbExtensions(buf) {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return [];
  try {
    return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')).extensionsUsed ?? [];
  } catch {
    return [];
  }
}

/** three.js decoders. The runtime only gets the folder; three.js loads the files by fixed names */
export const DECODERS = {
  draco: { dir: 'examples/jsm/libs/draco/gltf', files: ['draco_wasm_wrapper.js', 'draco_decoder.wasm'] },
  basis: { dir: 'examples/jsm/libs/basis', files: ['basis_transcoder.js', 'basis_transcoder.wasm'] },
};

/** Adds to need the decoders required by a file going into the bundle */
function addNeededDecoders(need, path, buf) {
  if (/\.ktx2$/i.test(path)) need.add('basis');
  if (!/\.glb$/i.test(path)) return;
  const ext = glbExtensions(buf);
  if (ext.includes('KHR_draco_mesh_compression')) need.add('draco');
  if (ext.includes('KHR_texture_basisu')) need.add('basis');
}

/** Files the scene expects at known paths that are missing */
function missingFiles(scene, contentDir) {
  const expect = [...(scene.assets ?? []), ...(scene.placed ?? []).map((p) => p.asset)];
  for (const m of Object.values(scene.materials ?? {})) {
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (m?.[k]) expect.push(m[k]);
  }
  if (scene.environment?.source === 'hdri') expect.push(scene.environment.hdri, scene.environment.hdriB);
  return [...new Set(expect)].filter((p) => p && !existsSync(join(contentDir, p)));
}

/**
 * @param {{ projectDir: string, scene?: string, outDir?: string, assets: string[] }} opts
 *   assets is the list from the runtime's publishCheck: files that asset parameters point to, including defaults the scene definition
 *   doesn't contain. Publish refuses to run without it.
 * @returns {{ ok: boolean, outDir: string, manifest?: object, files: number, bytes: number, errors: string[] }}
 */
export function publish({ projectDir, scene = 'scenes/main.stage.json', outDir, assets }) {
  const contentDir = resolve(projectDir, 'content');
  const out = resolve(outDir ?? join(projectDir, 'dist', 'bundle'));
  if (!Array.isArray(assets)) return { ok: false, outDir: out, files: 0, bytes: 0, errors: ['The list of files that asset parameters point to was not passed'] };
  const errors = [];
  const scenePath = join(contentDir, scene);
  if (!existsSync(scenePath)) return { ok: false, outDir: out, files: 0, bytes: 0, errors: [`${scene} does not exist`] };
  const sceneText = readFileSync(scenePath, 'utf8');
  let def;
  try {
    def = JSON.parse(sceneText);
  } catch (e) {
    return { ok: false, outDir: out, files: 0, bytes: 0, errors: [`Cannot read ${scene} as JSON: ${e.message}`] };
  }
  if (typeof def.schemaVersion !== 'number') errors.push(`${scene} has no schemaVersion`);
  // Events are called by name, so if two Timelines share a name only one of them can play
  const names = (Array.isArray(def.timelines) ? def.timelines : []).map((t) => t?.name);
  for (const n of new Set(names.filter((n, i) => names.indexOf(n) !== i))) errors.push(`More than one Event Timeline is named ${n}`);
  for (const p of missingFiles(def, contentDir)) errors.push(`${p} is missing from content/`);
  // publishCheck only checks that these files exist, so paths outside content/ or inside scenes/ get past it
  for (const a of assets) if (!contentFile(contentDir, a)) errors.push(`${a}, which an asset parameter points to, is not a file in content/`);
  if (errors.length) return { ok: false, outDir: out, files: 0, bytes: 0, errors };

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const files = {};
  const copied = new Map();
  const need = new Set();
  let bytes = 0;
  for (const [key, p] of referencedFiles(def, contentDir, assets)) {
    let name = copied.get(p);
    if (!name) {
      const buf = readFileSync(join(contentDir, p));
      name = hashedName(p, buf);
      mkdirSync(dirname(join(out, name)), { recursive: true });
      copyFileSync(join(contentDir, p), join(out, name));
      copied.set(p, name);
      addNeededDecoders(need, p, buf);
      bytes += buf.length;
    }
    files[key] = name;
  }
  // Decoder files change with the three.js version but keep their names, so the folder name carries the content hash
  const decoders = {};
  for (const kind of [...need].sort()) {
    const { dir, files: names } = DECODERS[kind];
    const from = join(findPackage('three'), dir);
    const bufs = names.map((n) => readFileSync(join(from, n)));
    const folder = `decoders/${kind}.${hash(Buffer.concat(bufs))}/`;
    mkdirSync(join(out, folder), { recursive: true });
    names.forEach((n, i) => {
      writeFileSync(join(out, folder, n), bufs[i]);
      bytes += bufs[i].length;
    });
    decoders[kind] = folder;
  }
  const sceneBuf = Buffer.from(sceneText.replace(/\r\n/g, '\n'), 'utf8');
  const sceneName = `scene.${hash(sceneBuf)}.json`;
  writeFileSync(join(out, sceneName), sceneBuf);
  bytes += sceneBuf.length;
  // Lists the Events for the host app: the names it calls them by, and the Trigger that fires each
  const events = (Array.isArray(def.timelines) ? def.timelines : []).map((t) => ({ name: t.name, trigger: t.trigger?.type ?? 'none', params: t.trigger?.params ?? {} }));
  const manifest = { format: 1, scene: sceneName, source: scene, files, ...(events.length ? { events } : {}), ...(Object.keys(decoders).length ? { decoders } : {}) };
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const decoderFiles = Object.keys(decoders).reduce((n, k) => n + DECODERS[k].files.length, 0);
  return { ok: true, outDir: out, manifest, files: copied.size + 1 + decoderFiles, bytes, errors: [] };
}
