import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { StageCanvas } from './StageCanvas';
import { SceneContent, SceneHandle } from './SceneContent';
import { CameraDirector } from './CameraDirector';
import { OverlayFrame } from './OverlayFrame';
import { DataContext, DataStore } from './data';
import { Playback, PlaybackContext } from './playback';
import { StageEnvContext, defaultSettings, type Decoders, type StageEnv, type StageSettings } from './context';
import { defaultRender, normalizeScene, type StageSceneDef } from './schema';
import { FrameStats } from './stats';
import { FollowContext, FollowStore, FollowTracker } from './follow';
import { ActivationContext, ActivationDirector, ActivationStore, AnimationDirector } from './activation';
import { EventContext, EventDirector, EventStore, eventOnlyTargets } from './events';

/** The manifest.json written by Publish. File names include a hash of their contents, so everything except manifest.json can be cached for a long time. */
export interface BundleManifest {
  /** Manifest format version. */
  format: 1;
  /** Path of the scene definition, relative to manifest.json. */
  scene: string;
  /** The scene definition it was built from (a path inside `content/`). */
  source?: string;
  /** Path inside `content/` as written in the scene definition → path relative to manifest.json. */
  files: Record<string, string>;
  /** The Events. Each can be called directly by `name`. `trigger` is the data change that starts it (`'none'` plays only when called directly). */
  events?: { name: string; trigger: string; params: Record<string, unknown> }[];
  /** Locations of the programs that decode compressed glb files and textures (relative to manifest.json). Only the ones the scene uses are present. */
  decoders?: Decoders;
}

/** Props of {@link StageView}. Pass one of `scene`, `sceneUrl` or `bundle`. */
export interface StageViewProps {
  /** URL of the manifest.json of a scene bundle made with Publish. To load a scene straight from `content/`, pass `sceneUrl` and `contentBase` instead. */
  bundle?: string;
  /** The scene definition itself. */
  scene?: StageSceneDef;
  /** URL of a *.stage.json file. */
  sceneUrl?: string;
  /** URL prefixed to paths inside `content/` (ending in `/`). Not needed with `bundle`. */
  contentBase?: string;
  /** Locations of the programs that decode compressed glb files and textures. Not needed with `bundle` (manifest.json lists them). */
  decoders?: Decoders;
  /** The data the scene displays. */
  data?: unknown;
  /** When the data was received. A change shows the receive effect. */
  receivedAt?: number | null;
  /** Overrides for the default viewer settings. */
  settings?: Partial<StageSettings>;
  /** Receives per-frame measurements. Measured internally when omitted (Dynamic Resolution needs it). */
  stats?: FrameStats;
  /** Set to false to hide the 2D UI. */
  overlay?: boolean;
  /** Pass this to call Events directly (events.fire). Created internally when omitted. */
  events?: EventStore;
  /** Class name of the outer element. */
  className?: string;
}

function useJson<T>(url: string | undefined, cache: RequestCache) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url, { cache })
      .then((r) => {
        if (!r.ok) throw new Error(`Cannot load ${url}: ${r.status}`);
        return r.json();
      })
      .then((j) => !cancelled && setValue(j))
      .catch((e) => !cancelled && setError(String(e.message || e)));
    return () => {
      cancelled = true;
    };
  }, [url, cache]);
  return { value, error };
}

function useBundle(bundle: string | undefined) {
  const { value, error } = useJson<BundleManifest>(bundle, 'no-store');
  const info = useMemo(() => {
    if (!bundle || !value) return null;
    const base = new URL('.', new URL(bundle, location.href)).href;
    const decoders = Object.fromEntries(Object.entries(value.decoders ?? {}).map(([k, v]) => [k, base + v])) as Decoders;
    return { sceneUrl: base + value.scene, url: (p: string) => base + (value.files[p] ?? p), decoders };
  }, [bundle, value]);
  return { info, error };
}

/**
 * Loads and normalizes a *.stage.json file. Returns `{ scene, error }`; both are null while loading.
 * @param cache `'default'` for a scene bundle file whose name includes a hash, `'no-store'` for a file in `content/` that may change.
 */
export function useSceneFile(url: string | undefined, cache: RequestCache = 'no-store') {
  const { value, error } = useJson<unknown>(url, cache);
  return useMemo(() => {
    if (error || !value) return { scene: null, error };
    try {
      return { scene: normalizeScene(value), error: null };
    } catch (e: any) {
      return { scene: null, error: String(e.message || e) };
    }
  }, [value, error]);
}

/** Renders a scene in the host app, with the same rendering and motion as Play in the studio. */
export function StageView(props: StageViewProps) {
  const bundle = useBundle(props.scene || props.sceneUrl ? undefined : props.bundle);
  const loaded = useSceneFile(props.scene ? undefined : (props.sceneUrl ?? bundle.info?.sceneUrl), props.sceneUrl ? 'no-store' : 'default');
  const scene = props.scene ?? loaded.scene;
  const error = bundle.error ?? loaded.error;
  const store = useMemo(() => new DataStore(), []);
  const follow = useMemo(() => new FollowStore(), []);
  const activation = useMemo(() => new ActivationStore(), []);
  const handle = useMemo(() => new SceneHandle(), []);
  const stats = useMemo(() => props.stats ?? new FrameStats(), [props.stats]);
  const events = useMemo(() => props.events ?? new EventStore(), [props.events]);
  const playback = useMemo(() => {
    const p = new Playback();
    p.playing = true;
    return p;
  }, []);

  // EventDirector does not run until the Canvas's first frame, so event-only 2D UI parts are hidden here before the first paint.
  useLayoutEffect(() => {
    if (scene) activation.writeEventOnly(eventOnlyTargets(scene.timelines, scene.tracks));
  }, [activation, scene]);

  useEffect(() => {
    store.set(props.data, props.receivedAt ?? null);
  }, [store, props.data, props.receivedAt]);

  const bundleUrl = bundle.info?.url;
  // Compare decoder locations as strings, so a caller creating a new object every render does not cause re-renders.
  const given = bundle.info ? bundle.info.decoders : props.decoders;
  const draco = given?.draco;
  const basis = given?.basis;
  const decoders = useMemo<Decoders>(() => ({ draco, basis }), [draco, basis]);
  const render = scene?.render;
  const env = useMemo<StageEnv>(
    () => ({
      url: bundleUrl ?? ((p) => (props.contentBase ?? '') + p),
      decoders,
      log: (level, text) => (level === 'error' ? console.error(text) : level === 'warn' ? console.warn(text) : console.info(text)),
      settings: { ...defaultSettings, ...props.settings },
      render: render ?? defaultRender(),
      editing: false,
    }),
    [bundleUrl, decoders, props.contentBase, props.settings?.quality, props.settings?.resolution, props.settings?.limitFps, render],
  );

  useEffect(() => {
    if (error) console.error(error);
  }, [error]);

  return (
    <div className={props.className} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <StageEnvContext.Provider value={env}>
        <DataContext.Provider value={store}>
          <PlaybackContext.Provider value={playback}>
            <FollowContext.Provider value={follow}>
              <ActivationContext.Provider value={activation}>
                <EventContext.Provider value={events}>
                  {scene && (
                    <>
                      <StageCanvas stats={stats} style={{ position: 'absolute', inset: 0 }}>
                        <SceneContent scene={scene} handle={handle} />
                        <CameraDirector cameras={scene.cameras} playback={playback} />
                        <ActivationDirector tracks={scene.tracks} cameras={scene.cameras} playback={playback} handle={handle} />
                        <AnimationDirector tracks={scene.animations} cameras={scene.cameras} playback={playback} handle={handle} />
                        <EventDirector timelines={scene.timelines} tracks={scene.tracks} handle={handle} />
                        <FollowTracker />
                      </StageCanvas>
                      <OverlayFrame visible={props.overlay !== false} />
                    </>
                  )}
                </EventContext.Provider>
              </ActivationContext.Provider>
            </FollowContext.Provider>
          </PlaybackContext.Provider>
        </DataContext.Provider>
      </StageEnvContext.Provider>
    </div>
  );
}
