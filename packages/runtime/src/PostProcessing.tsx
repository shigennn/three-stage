import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { BUILTIN_POST_EFFECTS, isBuiltinPostEffect, type PostEffectDef, type PostEffectType } from './schema';
import { fitFrame, useStageSize } from './OverlayFrame';
import { defaultParams, registry, type PostEffectShaderDef, type ShaderUniforms } from './registry';
import { useRegistry } from './useRegistry';
import { useStageEnv } from './context';
import { useStageData } from './data';
import { TextureCache } from './materials';
import { createUniforms, tickUniforms, writeUniforms } from './uniforms';
import { ktx2Loader } from './decoders';

// The post-processing chain. Built-in effect and parameter names follow the three.js passes (UnrealBloomPass, VignetteShader, FXAAPass, SMAAPass).

/** A numeric parameter of a built-in post effect. */
export interface PostParamDef {
  /** Value used when the scene definition has none. */
  default: number;
  /** Lowest value in the studio. */
  min: number;
  /** Highest value in the studio. */
  max: number;
  /** Step of the studio input. */
  step: number;
  /** Label shown in the studio. */
  label: string;
}

/** The built-in post-processing types and their parameters. The studio's Environment Inspector is built from this. */
export const POST_EFFECTS: Record<PostEffectType, { label: string; params: Record<string, PostParamDef> }> = {
  bloom: {
    label: 'Bloom',
    params: {
      strength: { default: 0.3, min: 0, max: 3, step: 0.01, label: 'Strength' },
      radius: { default: 0.2, min: 0, max: 1, step: 0.005, label: 'Radius' },
      threshold: { default: 1.5, min: 0, max: 5, step: 0.01, label: 'Threshold' },
    },
  },
  vignette: {
    label: 'Vignette',
    params: {
      offset: { default: 1, min: 0, max: 3, step: 0.01, label: 'Offset' },
      darkness: { default: 0.5, min: 0, max: 2, step: 0.01, label: 'Darkness' },
    },
  },
  fxaa: { label: 'FXAA', params: {} },
  smaa: { label: 'SMAA', params: {} },
};

/** The order the built-in effects are applied in. Bloom comes before tone mapping and anti-aliasing comes last. */
export const POST_ORDER: readonly PostEffectType[] = BUILTIN_POST_EFFECTS;

/** Returns a numeric parameter of a post effect, falling back to the built-in default (or 0). */
export function postParam(def: PostEffectDef, key: string) {
  const v = def.params[key];
  if (typeof v === 'number') return v;
  return isBuiltinPostEffect(def.type) ? (POST_EFFECTS[def.type].params[key]?.default ?? 0) : 0;
}

const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

type CustomPass = { id: string; def: PostEffectShaderDef; pass: Pass; uniforms: ShaderUniforms; binding: Record<string, string> };

function createCustomPass(def: PostEffectShaderDef, uniforms: ShaderUniforms): Pass | null {
  if (def.create) return def.create(uniforms);
  if (!def.fragmentShader) return null;
  // Given a ShaderMaterial, ShaderPass uses its uniforms as they are instead of copying them, so value updates reach the shader directly.
  uniforms.tDiffuse = { value: null };
  return new ShaderPass(new THREE.ShaderMaterial({ uniforms, vertexShader: FULLSCREEN_VERTEX, fragmentShader: def.fragmentShader }));
}

// The three.js VignetteShader formula, appended to OutputPass after the sRGB conversion.
// It uses the output frame, not the canvas: in the studio's Edit mode the canvas is larger than the frame.
const VIGNETTE = /* glsl */ `
  vec2 vigUv = ((vUv - vigFrame.xy) / vigFrame.zw - vec2(0.5)) * vec2(vigOffset);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0 - vigDarkness), dot(vigUv, vigUv));
}`;

/** Tone mapping and conversion to sRGB. The vignette is applied here too, saving one full-screen pass. */
class FinalPass extends OutputPass {
  readonly vignette: boolean;
  constructor(vignette: boolean) {
    super();
    this.vignette = vignette;
    if (!vignette) return;
    Object.assign(this.uniforms, {
      vigOffset: { value: 1 },
      vigDarkness: { value: 0.5 },
      vigFrame: { value: new THREE.Vector4(0, 0, 1, 1) },
    });
    this.material.fragmentShader = this.material.fragmentShader
      .replace('varying vec2 vUv;', 'varying vec2 vUv;\nuniform float vigOffset;\nuniform float vigDarkness;\nuniform vec4 vigFrame;')
      .replace(/}\s*$/, VIGNETTE);
  }
}

function Composer({ effects }: { effects: PostEffectDef[] }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const stage = useStageSize();
  const env = useStageEnv();
  const data = useStageData();
  const registryVersion = useRegistry();
  // Screen-space images, so flipY is true (glb textures use false).
  const textures = useMemo(() => new TextureCache(true), []);
  useEffect(() => () => textures.dispose(), [textures]);
  const basis = env.decoders?.basis;
  textures.ktx2 = () => (basis ? ktx2Loader(gl, basis) : null);
  textures.log = env.log;
  // A .ktx2 arrives after the values were written; write them again so it reaches the uniform.
  const [texturesLoaded, setTexturesLoaded] = useState(0);
  useEffect(() => textures.onChange(() => setTexturesLoaded((n) => n + 1)), [textures]);
  // Rebuilding because another effect was added or FXAA was toggled must not reset uTime or the values written by update.
  const kept = useRef(new Map<string, ShaderUniforms>());
  // A registry change can change the uniforms' shape, so kept uniforms are dropped then.
  const keptVersion = useRef<unknown>(null);
  const types = new Set(effects.map((e) => e.type));
  // The chain is rebuilt only when this key changes. Registered effects are in it in list order, so reordering them rebuilds.
  const key =
    POST_ORDER.filter((t) => types.has(t)).join(',') +
    '|' +
    effects
      .filter((e) => !isBuiltinPostEffect(e.type))
      .map((e) => e.id + ':' + e.type)
      .join(',');

  const chain = useMemo(() => {
    const has = new Set(key.split(/[,|]/));
    const composer = new EffectComposer(gl, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
    const render = new RenderPass(scene, new THREE.PerspectiveCamera());
    composer.addPass(render);
    const custom: CustomPass[] = [];
    const prev = kept.current;
    const next = new Map<string, ShaderUniforms>();
    const addCustom = (stage: PostEffectShaderDef['stage']) => {
      for (const fx of effects) {
        if (isBuiltinPostEffect(fx.type)) continue;
        const def = registry.postEffect(fx.type);
        if (!def) {
          if (stage === 'hdr') env.log('warn', `Post effect ${fx.type} is not registered`);
          continue;
        }
        if (stage === 'hdr' && def.stage !== 'hdr' && def.stage !== 'display') env.log('warn', `Post effect ${fx.type}: stage must be hdr or display`);
        if (def.stage !== stage) continue;
        const k = `${fx.id}:${fx.type}`;
        const reuse = registryVersion === keptVersion.current ? prev.get(k) : undefined;
        const uniforms = reuse ?? createUniforms(def.params, def.binding, def.uniforms);
        uniforms.uFrame ??= { value: new THREE.Vector4(0, 0, 1, 1) };
        next.set(k, uniforms);
        try {
          const pass = createCustomPass(def, uniforms);
          if (!pass) {
            env.log('warn', `Post effect ${fx.type} has neither fragmentShader nor create`);
            continue;
          }
          composer.addPass(pass);
          custom.push({ id: fx.id, def, pass, uniforms, binding: {} });
        } catch (err: any) {
          env.log('error', `Cannot create post effect ${fx.type}: ${err?.message ?? err}`);
        }
      }
    };
    const bloom = has.has('bloom') ? new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.2, 1.5) : null;
    if (bloom) composer.addPass(bloom);
    addCustom('hdr');
    const final = new FinalPass(has.has('vignette'));
    composer.addPass(final);
    addCustom('display');
    const fxaa = has.has('fxaa') ? new FXAAPass() : null;
    if (fxaa) composer.addPass(fxaa);
    const smaa = has.has('smaa') ? new SMAAPass() : null;
    if (smaa) composer.addPass(smaa);
    kept.current = next;
    keptVersion.current = registryVersion;
    return { composer, render, bloom, final, fxaa, smaa, custom };
    // Only the parts of effects captured in key are used here. Value changes don't rebuild the chain.
  }, [gl, scene, key, registryVersion]);

  useEffect(
    () => () => {
      for (const p of [chain.render, chain.bloom, chain.final, chain.fxaa, chain.smaa, ...chain.custom.map((c) => c.pass)]) p?.dispose();
      chain.composer.dispose();
    },
    [chain],
  );

  useLayoutEffect(() => {
    chain.composer.setPixelRatio(dpr);
    chain.composer.setSize(size.width, size.height);
    // uFrame's origin is bottom-left; f.top works as the bottom offset because the frame is centered.
    const f = fitFrame(size.width, size.height, stage);
    const frame = [f.left / size.width, f.top / size.height, f.width / size.width, f.height / size.height] as const;
    if (chain.final.vignette) chain.final.uniforms.vigFrame.value.set(...frame);
    for (const c of chain.custom) (c.uniforms.uFrame.value as THREE.Vector4).set(...frame);
  }, [chain, size.width, size.height, dpr, stage.width, stage.height]);

  useLayoutEffect(() => {
    const used = new Set<string>();
    for (const e of effects) {
      if (e.type === 'bloom' && chain.bloom) {
        chain.bloom.strength = postParam(e, 'strength');
        chain.bloom.radius = postParam(e, 'radius');
        chain.bloom.threshold = postParam(e, 'threshold');
      }
      if (e.type === 'vignette' && chain.final.vignette) {
        chain.final.uniforms.vigOffset.value = postParam(e, 'offset');
        chain.final.uniforms.vigDarkness.value = postParam(e, 'darkness');
      }
      const c = chain.custom.find((x) => x.id === e.id);
      if (c) {
        c.binding = e.binding ?? {};
        writeUniforms(c.uniforms, c.def.params, defaultParams(c.def, e.params), (path, srgb) => {
          used.add(textures.key(env.url(path), srgb));
          return textures.get(env.url(path), srgb);
        });
      }
    }
    textures.retain(used);
  }, [chain, effects, textures, env, texturesLoaded]);

  // With a priority-1 useFrame present, R3F stops rendering on its own, so the frame is rendered here.
  useFrame((state, dt) => {
    for (const c of chain.custom) {
      tickUniforms(c.uniforms, c.binding, data.value, dt);
      c.def.update?.(c.uniforms, data.value, dt);
    }
    chain.render.camera = state.camera;
    chain.composer.render(dt);
  }, 1);

  return null;
}

/** Applies the scene definition's post-processing. With no enabled effects it adds nothing and R3F renders as usual. */
export function PostProcessing({ effects }: { effects: PostEffectDef[] }) {
  const on = useMemo(() => effects.filter((e) => e.enabled), [effects]);
  return on.length ? <Composer effects={on} /> : null;
}
