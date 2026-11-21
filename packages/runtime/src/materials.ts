import * as THREE from 'three';
import { isBuiltinMaterial, MATERIAL_MAPS, type BuiltinMaterialDef, type MaterialDef, type MaterialMapKey, type ShaderMaterialDef } from './schema';
import { defaultParams, registry, type ShaderDef, type ShaderUniforms } from './registry';
import { createUniforms, tickUniforms, writeUniforms } from './uniforms';
import type { Logger } from './context';
import { isKtx2 } from './decoders';

const SRGB_MAPS = new Set<MaterialMapKey>(['map', 'emissiveMap']);

/** Loads .ktx2 files. It needs the renderer, so the user of the cache provides it. */
type Ktx2Source = () => { load(url: string, onLoad: (t: THREE.Texture) => void, onProgress?: unknown, onError?: (e: unknown) => void): void } | null;

/** Loads and caches textures by URL and color space. Textures no longer in use are disposed with {@link TextureCache.retain}. */
export class TextureCache {
  private loader = new THREE.TextureLoader();
  /** A .ktx2 entry is null until it finishes loading; onChange listeners are notified then. */
  private cache = new Map<string, THREE.Texture | null>();
  private listeners = new Set<() => void>();
  /** Returns the .ktx2 loader, or null when no Basis decoder location is set. */
  ktx2: Ktx2Source = () => null;
  /** Receives warnings about textures that cannot be loaded. */
  log?: Logger;

  /** `flipY` is false for textures on glb meshes (glTF UVs are not flipped) and true for images overlaid on the screen. A .ktx2 cannot be flipped. */
  constructor(private flipY = false) {}

  /** Returns the cache key of a URL and color space, as used by {@link TextureCache.retain}. */
  key(url: string, srgb: boolean) {
    return url + (srgb ? '#srgb' : '');
  }

  /** Returns the texture for a URL, starting the load if needed. A .ktx2 returns null until it finishes loading. */
  get(url: string, srgb: boolean): THREE.Texture | null {
    const key = this.key(url, srgb);
    if (this.cache.has(key)) return this.cache.get(key)!;
    if (isKtx2(url)) {
      this.cache.set(key, null);
      this.loadKtx2(url, key, srgb);
      return null;
    }
    const t = this.loader.load(url);
    t.flipY = this.flipY;
    this.setup(t, srgb);
    this.cache.set(key, t);
    return t;
  }

  /** Calls `f` when what get returns changes, such as when a .ktx2 finishes loading. Returns a function that removes the listener. */
  onChange(f: () => void) {
    this.listeners.add(f);
    return () => void this.listeners.delete(f);
  }

  private setup(t: THREE.Texture, srgb: boolean) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  }

  private loadKtx2(url: string, key: string, srgb: boolean) {
    const loader = this.ktx2();
    if (this.flipY) this.log?.('warn', `${url}: a .ktx2 cannot be flipped vertically, so when overlaid on the screen it is upside down compared with a .png`);
    if (!loader) {
      this.log?.('warn', `${url} is a .ktx2, but no Basis decoder location was given, so it cannot be loaded`);
      return;
    }
    loader.load(
      url,
      (t) => {
        // Don't use textures that were dropped (removed by retain) before they finished loading.
        if (!this.cache.has(key) || this.cache.get(key) !== null) return void t.dispose();
        this.setup(t, srgb);
        this.cache.set(key, t);
        this.listeners.forEach((f) => f());
      },
      undefined,
      (e) => this.log?.('warn', `Cannot load ${url}: ${(e as Error)?.message ?? e}`),
    );
  }

  /** Disposes every cached texture whose key is not in `keep`. */
  retain(keep: Set<string>) {
    for (const [k, t] of this.cache) {
      if (!keep.has(k)) {
        t?.dispose();
        this.cache.delete(k);
      }
    }
  }

  /** Disposes all cached textures. */
  dispose() {
    this.retain(new Set());
  }
}

type Mat = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

type BuiltinEntry = { kind: 'builtin'; type: string; mat: Mat; maps: string };
type ShaderEntry = {
  kind: 'shader';
  type: string;
  name: string;
  /** The registration it was created from. Recreated when hot reload changes the registration. */
  def: ShaderDef | undefined;
  /** The material for the vertexShader form, or the fallback when creation failed. For the create form, created when applied where there is no original material. */
  mat: THREE.Material | null;
  /** For the create form, one material per original material. */
  perBase: Map<THREE.Material, THREE.Material>;
  /** Material used when drawing shadows, so shadows match even when the vertex shader moves the geometry. */
  depth: THREE.Material | null;
  uniforms: ShaderUniforms;
  binding: Record<string, string>;
  log?: Logger;
  /** Reloading a glb disposes its original materials (disposeObject). Dispose what was created from them at the same time. */
  onBaseDispose: (ev: { target: THREE.Material }) => void;
};

// Writes depth into the shadow map. It writes in the same format as three.js MeshDepthMaterial (RGBADepthPacking), so shadow lookup needs no changes.
const DEPTH_FRAGMENT = /* glsl */ `
#include <packing>
void main() {
  gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
}`;

/** Pink stand-in for unregistered types and materials that failed to build. */
const missingMaterial = () => new THREE.MeshBasicMaterial({ color: '#FF00FF' });

/** Builds three.js materials from the scene definition's materials, and updates them in place (without rebuilding) when values change. */
export class MaterialLibrary {
  private mats = new Map<string, BuiltinEntry | ShaderEntry>();
  /** Textures used by the materials. */
  readonly textures = new TextureCache();
  private last: Parameters<MaterialLibrary['sync']> | null = null;

  constructor() {
    // A .ktx2 finishes loading later, so apply the same definitions again once it does.
    this.textures.onChange(() => this.last && this.sync(...this.last));
  }

  /** Brings the materials in line with `defs`. Materials no longer in `defs` are disposed. */
  sync(defs: Record<string, MaterialDef>, url: (path: string) => string, log?: Logger) {
    this.last = [defs, url, log];
    this.textures.log = log;
    const used = new Set<string>();
    for (const [id, d] of Object.entries(defs)) {
      if (isBuiltinMaterial(d)) this.syncBuiltin(id, d, url, used);
      else this.syncShader(id, d, url, used, log);
    }
    for (const [id, e] of this.mats) {
      if (!(id in defs)) {
        disposeEntry(e);
        this.mats.delete(id);
      }
    }
    this.textures.retain(used);
  }

  private syncBuiltin(id: string, d: BuiltinMaterialDef, url: (path: string) => string, used: Set<string>) {
    let e = this.mats.get(id);
    if (!e || e.kind !== 'builtin' || e.type !== d.type) {
      if (e) disposeEntry(e);
      const mat = d.type === 'physical' ? new THREE.MeshPhysicalMaterial() : new THREE.MeshStandardMaterial();
      e = { kind: 'builtin', type: d.type, mat, maps: '' };
      this.mats.set(id, e);
    }
    const m = e.mat;
    m.name = d.name;
    m.color.set(d.color);
    m.roughness = d.roughness;
    m.metalness = d.metalness;
    m.emissive.set(d.emissive);
    m.emissiveIntensity = d.emissiveIntensity;
    m.opacity = d.opacity;
    m.envMapIntensity = d.envMapIntensity;
    if (m.transparent !== d.transparent) {
      m.transparent = d.transparent;
      m.needsUpdate = true;
    }
    const mapSig: string[] = [];
    for (const k of MATERIAL_MAPS) {
      const path = d[k];
      const srgb = SRGB_MAPS.has(k);
      const tex = path ? this.textures.get(url(path), srgb) : null;
      if (path) used.add(this.textures.key(url(path), srgb));
      (m as any)[k] = tex;
      // Whether a texture is present changes the shader, so also force a rebuild when a .ktx2 finishes loading.
      mapSig.push(path ? path + (tex ? '' : '?') : '');
    }
    const sig = mapSig.join('|');
    if (sig !== e.maps) {
      e.maps = sig;
      m.needsUpdate = true;
    }
    if (m instanceof THREE.MeshPhysicalMaterial) {
      m.clearcoat = d.clearcoat ?? 0;
      m.clearcoatRoughness = d.clearcoatRoughness ?? 0;
      m.transmission = d.transmission ?? 0;
      m.thickness = d.thickness ?? 0;
      m.ior = d.ior ?? 1.5;
      m.sheen = d.sheen ?? 0;
      m.sheenColor.set(d.sheenColor ?? '#FFFFFF');
    }
  }

  private syncShader(id: string, d: ShaderMaterialDef, url: (path: string) => string, used: Set<string>, log?: Logger) {
    const def = registry.shader(d.type);
    let e = this.mats.get(id);
    if (!e || e.kind !== 'shader' || e.type !== d.type || e.def !== def) {
      if (e) disposeEntry(e);
      e = createShader(d, def, log);
      this.mats.set(id, e);
    }
    e.name = d.name;
    if (e.mat) e.mat.name = d.name;
    for (const [base, m] of e.perBase) if (m !== base) m.name = d.name;
    e.binding = d.binding;
    if (!def) return;
    writeUniforms(e.uniforms, def.params, defaultParams(def, d.params), (path, srgb) => {
      used.add(this.textures.key(url(path), srgb));
      return this.textures.get(url(path), srgb);
    });
  }

  /** Runs every frame: advances uTime and writes the values bound to data into the uniforms. While paused, dt is 0, so uTime stops too. */
  tick(dt: number, data: unknown) {
    for (const e of this.mats.values()) {
      if (e.kind !== 'shader') continue;
      tickUniforms(e.uniforms, e.binding, data, dt);
      e.def?.update?.(e.uniforms, data, dt);
    }
  }

  /** The material shared by every object it is applied to. undefined for create-form shaders, which build a separate material per object. */
  shared(id: string): THREE.Material | undefined {
    const e = this.mats.get(id);
    if (!e || (e.kind === 'shader' && e.def?.create)) return undefined;
    return e.mat ?? undefined;
  }

  /** Returns the material for `id`. `base` is the original material of the slot it is applied to; create-form shaders return one built from it. */
  get(id: string, base?: THREE.Material): THREE.Material | undefined {
    const e = this.mats.get(id);
    if (!e) return undefined;
    if (e.kind === 'builtin' || !e.def?.create) return e.mat ?? undefined;
    if (!base) return (e.mat ??= createFrom(e, undefined));
    let m = e.perBase.get(base);
    if (!m) {
      e.perBase.set(base, (m = createFrom(e, base)));
      base.addEventListener('dispose', e.onBaseDispose);
    }
    return m;
  }

  /** The material used when drawing shadows. Present only for shaders that define a vertex shader. */
  depth(id: string): THREE.Material | undefined {
    const e = this.mats.get(id);
    return (e?.kind === 'shader' && e.depth) || undefined;
  }

  /** Disposes all materials and textures. */
  dispose() {
    for (const e of this.mats.values()) disposeEntry(e);
    this.mats.clear();
    this.textures.dispose();
  }
}

function disposeEntry(e: BuiltinEntry | ShaderEntry) {
  e.mat?.dispose();
  if (e.kind !== 'shader') return;
  // When create returned base itself, it belongs to the glb, so don't dispose it.
  for (const [base, m] of e.perBase) {
    base.removeEventListener('dispose', e.onBaseDispose);
    if (m !== base) m.dispose();
  }
  e.perBase.clear();
  e.depth?.dispose();
}

function createShader(d: ShaderMaterialDef, def: ShaderDef | undefined, log?: Logger): ShaderEntry {
  const entry: ShaderEntry = {
    kind: 'shader',
    type: d.type,
    name: d.name,
    def,
    mat: null,
    perBase: new Map(),
    depth: null,
    uniforms: {},
    binding: d.binding,
    log,
    onBaseDispose: ({ target }) => {
      const m = entry.perBase.get(target);
      target.removeEventListener('dispose', entry.onBaseDispose);
      entry.perBase.delete(target);
      if (m && m !== target) m.dispose();
    },
  };
  if (!def) {
    log?.('warn', `${d.name}: shader ${d.type} is not registered`);
    entry.mat = missingMaterial();
    return entry;
  }
  const u = createUniforms(def.params, def.binding, def.uniforms);
  entry.uniforms = u;
  if (def.create) return entry;
  try {
    if (def.vertexShader && def.fragmentShader) {
      entry.mat = new THREE.ShaderMaterial({ ...def.options, uniforms: u, vertexShader: def.vertexShader, fragmentShader: def.fragmentShader });
      // three.js copies the face side from the original material every time it draws shadows, so it is not passed here.
      entry.depth = new THREE.ShaderMaterial({ defines: { ...def.options?.defines }, uniforms: u, vertexShader: def.vertexShader, fragmentShader: DEPTH_FRAGMENT });
    } else {
      log?.('warn', `${d.name}: shader ${d.type} needs vertexShader and fragmentShader, or create`);
    }
  } catch (err: any) {
    log?.('error', `${d.name}: cannot create the material for shader ${d.type}: ${err?.message ?? err}`);
  }
  entry.mat ??= missingMaterial();
  return entry;
}

/** Creates one material from a create-form shader. Pink if it fails. */
function createFrom(e: ShaderEntry, base: THREE.Material | undefined): THREE.Material {
  try {
    const m = e.def!.create!(e.uniforms, base);
    if (m !== base) m.name = e.name;
    return m;
  } catch (err: any) {
    e.log?.('error', `${e.name}: cannot create the material for shader ${e.type}: ${err?.message ?? err}`);
    return missingMaterial();
  }
}

/** Creates a scene definition material from an original glb material (used when duplicating a slot's material to edit it). */
export function materialDefFrom(src: THREE.Material, name: string): BuiltinMaterialDef {
  const m = src as Partial<THREE.MeshPhysicalMaterial>;
  const hex = (c?: THREE.Color) => (c ? '#' + c.getHexString().toUpperCase() : '#FFFFFF');
  const d: BuiltinMaterialDef = {
    name,
    type: (src as any).isMeshPhysicalMaterial ? 'physical' : 'standard',
    color: hex(m.color),
    roughness: m.roughness ?? 0.7,
    metalness: m.metalness ?? 0,
    emissive: m.emissive ? hex(m.emissive) : '#000000',
    emissiveIntensity: m.emissiveIntensity ?? 1,
    opacity: m.opacity ?? 1,
    transparent: m.transparent ?? false,
    envMapIntensity: m.envMapIntensity ?? 1,
  };
  if (d.type === 'physical') {
    d.clearcoat = m.clearcoat;
    d.clearcoatRoughness = m.clearcoatRoughness;
    d.transmission = m.transmission;
    d.thickness = m.thickness;
    d.ior = m.ior;
  }
  return d;
}
