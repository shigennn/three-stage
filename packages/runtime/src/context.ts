import { createContext, useContext } from 'react';
import { defaultRender, type RenderDef } from './schema';

/** Severity of a log message. */
export type LogLevel = 'info' | 'warn' | 'error';

/** The item a log message points at. Clicking the message in the studio Console selects it. */
export type ItemRef =
  | { kind: 'object'; name: string }
  | { kind: 'placed'; id: string }
  | { kind: 'light'; id: string }
  | { kind: 'component'; id: string }
  | { kind: 'empty'; id: string }
  | { kind: 'camera'; id: string }
  | { kind: 'asset'; path: string };

/** Receives log messages from the runtime and from components. */
export type Logger = (level: LogLevel, text: string, ref?: ItemRef) => void;

/** Quality level, selecting `render.quality.high` or `render.quality.low`. */
export type Quality = 'high' | 'low';
/** Rendering resolution. `auto` uses Dynamic Resolution. */
export type Resolution = '1080p' | '720p' | 'auto';

/** Viewer settings that are not part of the scene definition. */
export interface StageSettings {
  /** Quality level. */
  quality: Quality;
  /** Rendering resolution. */
  resolution: Resolution;
  /** Caps the frame rate at 30fps. Turn it off when measuring. */
  limitFps: boolean;
}

/**
 * Locations (ending in `/`) of the three.js programs that decode compressed glb files and textures.
 * Files using a compression whose location is not set cannot be loaded.
 */
export interface Decoders {
  /** Draco (KHR_draco_mesh_compression). Holds draco_wasm_wrapper.js and draco_decoder.wasm. */
  draco?: string;
  /** Basis (.ktx2 and KHR_texture_basisu). Holds basis_transcoder.js and basis_transcoder.wasm. */
  basis?: string;
}

/** What the runtime needs from the page that renders it (the studio, the preview page or the host app). */
export interface StageEnv {
  /** Turns a path inside `content/` into a URL. */
  url(path: string): string;
  /** Locations of the decoders for compressed files. */
  decoders?: Decoders;
  /** Receives log messages. */
  log: Logger;
  /** Viewer settings. */
  settings: StageSettings;
  /** Aspect ratio, quality levels and Dynamic Resolution settings. The `render` of the open scene. */
  render: RenderDef;
  /** True while the scene is being edited in the studio. False during Play and outside the studio. */
  editing: boolean;
  /** Paused. Rendering continues, but the useFrame delta is 0, so component motion and Clips stop. */
  paused?: boolean;
}

/** Default viewer settings: high quality, 1080p, 30fps cap on. */
export const defaultSettings: StageSettings = { quality: 'high', resolution: '1080p', limitFps: true };

/** Provides the {@link StageEnv}. Without a provider, paths are used as URLs and logs go to the console. */
export const StageEnvContext = createContext<StageEnv>({
  url: (p) => p,
  log: (level, text) => (level === 'error' ? console.error(text) : level === 'warn' ? console.warn(text) : console.info(text)),
  settings: defaultSettings,
  render: defaultRender(),
  editing: false,
});

/** Returns the current {@link StageEnv}. */
export function useStageEnv() {
  return useContext(StageEnvContext);
}

/** A number per path inside `content/` that goes up when the file changes. Added to the URL to force a reload. */
export const VersionsContext = createContext<Record<string, number> | undefined>(undefined);

/** Returns the URL a component uses to load an asset. The URL changes when the file changes, so the asset is loaded again. */
export function useAssetUrl(path: string) {
  const env = useStageEnv();
  const v = useContext(VersionsContext)?.[path];
  return path ? env.url(path) + (v ? `?v=${v}` : '') : '';
}
