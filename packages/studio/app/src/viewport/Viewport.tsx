import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import {
  ActivationContext,
  ActivationDirector,
  ActivationStore,
  AnimationDirector,
  CameraDirector,
  DataContext,
  EventContext,
  EventDirector,
  EventStore,
  FollowContext,
  FollowStore,
  FollowTracker,
  OverlayFrame,
  PlaybackContext,
  Playback,
  SceneContent,
  StageCanvas,
  StageEnvContext,
  defaultRender,
  fitFrame,
  stageSize,
  useElementSize,
  type Quality,
  type Resolution,
  type StageEnv,
  type StageSettings,
} from '@three-stage/runtime';
import { Dropdown, MenuCheck, MenuItem, MenuRadio } from '../ui/Dropdown';
import { frameAll, frameSelected, toggleOrthographic, view, viewFromCamera } from '../keys';
import { edit, log, newId, select, uniqueName, useStudio, type Gizmos, type Overlays } from '../store';
import { NavGizmo } from './NavGizmo';
import { contentUrl, DECODERS } from '../api';
import { dataStore } from '../mock';
import { DRAG_ASSET } from '../ui/fields';
import { EditorCamera } from './EditorCamera';
import { Axes, Gizmo, Grid, Helpers, SelectionBoxes, Selectable, Wireframe } from './EditorOverlay';
import { leaveViewport, modal, trackMouse } from './modal';
import { viewport } from './refs';
import { StatsOverlay, studioStats } from './StatsOverlay';

export const playback = new Playback();
/** Event Timelines. The Inspector's play button calls fire, and the Timeline tab reads the playhead */
export const events = new EventStore();
const followStore = new FollowStore();
const activationStore = new ActivationStore();

events.onPlay((name, key, source) => log('info', `Played ${name}${key ? `  Key ${key}` : ''}${source === 'data' ? ' (data change)' : ''}`));

// Same order as Blender's View > Viewpoint. Top and bottom are offset slightly so OrbitControls can determine the orientation
const VIEWPOINTS = [
  { label: 'Top', side: '7', dir: new THREE.Vector3(0, 1, 0.0001) },
  { label: 'Bottom', side: 'Ctrl+7', dir: new THREE.Vector3(0, -1, 0.0001) },
  { label: 'Front', side: '1', dir: new THREE.Vector3(0, 0, 1) },
  { label: 'Back', side: 'Ctrl+1', dir: new THREE.Vector3(0, 0, -1) },
  { label: 'Right', side: '3', dir: new THREE.Vector3(1, 0, 0) },
  { label: 'Left', side: 'Ctrl+3', dir: new THREE.Vector3(-1, 0, 0) },
];

function AspectMask({ width, height, stage, label }: { width: number; height: number; stage: { width: number; height: number }; label: string }) {
  const f = fitFrame(width, height, stage);
  return (
    <div className="frame-mask" style={{ left: f.left, top: f.top, width: f.width, height: f.height }}>
      <span className="frame-label">{label}</span>
    </div>
  );
}

function ModalHint() {
  const [hint, setHint] = useState('');
  useEffect(() => modal.subscribe(() => setHint(modal.hint)), []);
  return hint ? <div className="modal-hint">{hint}</div> : null;
}

/** Places a .glb dropped from Assets on the surface of the object under the drop point, or on the ground */
function dropPoint(e: React.DragEvent): THREE.Vector3 {
  const cam = viewport.view;
  const canvas = viewport.canvas;
  const out = new THREE.Vector3();
  if (!cam || !canvas) return out;
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, cam);
  const h = useStudio.getState().handle;
  const targets = [...h.objects.values(), ...h.placed.values()].filter((o) => o.visible);
  const hit = ray.intersectObjects(targets, true)[0];
  if (hit) return out.copy(hit.point);
  if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out)) return out;
  return out.set(0, 0, 0);
}

export function Viewport() {
  const scene = useStudio((s) => s.scene);
  const mode = useStudio((s) => s.mode);
  const settings = useStudio((s) => s.settings);
  const hidden = useStudio((s) => s.hidden);
  const versions = useStudio((s) => s.versions);
  const overlays = useStudio((s) => s.overlays);
  const gizmo = useStudio((s) => s.gizmo);
  const handle = useStudio((s) => s.handle);
  const stats = useStudio((s) => s.stats);
  const orthographic = useStudio((s) => s.orthographic);
  const scrubT = useStudio((s) => s.scrubT);
  const [areaRef, area] = useElementSize<HTMLDivElement>();
  const [dropOver, setDropOver] = useState(false);
  useEffect(() => {
    viewport.area = areaRef.current;
    return () => void (viewport.area = null);
  }, [areaRef]);

  const render = scene?.render;
  const paused = useStudio((s) => s.paused);
  const env = useMemo<StageEnv>(
    () => ({ url: contentUrl, decoders: DECODERS, log, settings, render: render ?? defaultRender(), editing: mode === 'edit', paused }),
    [settings, mode, render, paused],
  );
  const setSettings = (p: Partial<StageSettings>) => useStudio.setState((s) => ({ settings: { ...s.settings, ...p } }));
  const gizmos = useStudio((s) => s.gizmos);
  const setGizmos = (p: Partial<Gizmos>) => useStudio.setState((s) => ({ gizmos: { ...s.gizmos, ...p } }));
  const setOverlays = (p: Partial<Overlays>) => useStudio.setState((s) => ({ overlays: { ...s.overlays, ...p } }));

  useEffect(() => {
    playback.playing = mode === 'play' && !paused;
  }, [mode, paused]);

  useEffect(() => {
    playback.t = useStudio.getState().scrubT ?? 0;
    if (mode === 'edit') {
      playback.cameraId = null;
      playback.blending = false;
    }
  }, [mode]);

  const aspectRatio = render?.aspectRatio ?? defaultRender().aspectRatio;
  const stage = stageSize(aspectRatio);
  const res = (h: number) => `${Math.round((h * aspectRatio[0]) / aspectRatio[1])} × ${h}`;

  // Play draws only the output frame. Edit draws across the whole Viewport and overlays the frame
  const f = fitFrame(area.width, area.height, stage);
  const canvasBox = mode === 'play' ? { left: f.left, top: f.top, width: f.width, height: f.height } : { left: 0, top: 0, width: area.width, height: area.height };

  const onDrop = (e: React.DragEvent) => {
    setDropOver(false);
    const path = e.dataTransfer.getData(DRAG_ASSET);
    if (!path || !path.toLowerCase().endsWith('.glb') || mode !== 'edit') return;
    e.preventDefault();
    const p = dropPoint(e);
    const id = newId('placed');
    const base = path.split('/').pop()!.replace(/\.glb$/i, '');
    const name = uniqueName(base);
    edit((d) => {
      d.placed.push({ id, name, asset: path, position: [p.x, p.y, p.z], rotation: [0, 0, 0], scale: [1, 1, 1] });
    });
    select(['placed:' + id]);
    log('info', `Placed ${name}  ${path}`, { kind: 'placed', id });
  };

  return (
    <div className="viewport">
      <div className="panel-head viewport-head">
        <span className="panel-title">Viewport</span>
        <Dropdown label="View" align="left" disabled={mode !== 'edit'}>
          <MenuRadio<boolean>
            label="Projection"
            value={orthographic}
            options={[
              { value: false, label: 'Perspective', side: '5' },
              { value: true, label: 'Orthographic', side: '5' },
            ]}
            onChange={(v) => v !== orthographic && toggleOrthographic()}
          />
          <div className="menu-group">Viewpoint</div>
          {VIEWPOINTS.map((v) => (
            <MenuItem key={v.label} label={v.label} side={v.side} onClick={() => view(v.dir.clone())} />
          ))}
          <MenuItem label="Camera" side="0" onClick={() => viewFromCamera()} />
          <div className="menu-sep" />
          <MenuItem label="Frame Selected" side="." onClick={frameSelected} />
          <MenuItem label="Frame All" side="Home" onClick={frameAll} />
        </Dropdown>
        <div className="seg">
          {(['translate', 'rotate', 'scale'] as const).map((m) => (
            <button key={m} className={gizmo === m ? 'on' : ''} onClick={() => useStudio.setState({ gizmo: m })} disabled={mode !== 'edit'} title={{ translate: 'G', rotate: 'R', scale: 'S' }[m]}>
              {{ translate: 'Translate', rotate: 'Rotate', scale: 'Scale' }[m]}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <Dropdown label="Gizmos">
          <MenuCheck label="Gizmos" checked={gizmos.show} onChange={(v) => setGizmos({ show: v })} />
          <div className={'menu-section' + (gizmos.show ? '' : ' off')}>
            <div className="menu-group">Viewport Gizmos</div>
            <MenuCheck label="View Helper" checked={gizmos.viewHelper} onChange={(v) => setGizmos({ viewHelper: v })} />
            <MenuCheck label="Transform Controls" checked={gizmos.transformControls} onChange={(v) => setGizmos({ transformControls: v })} />
            <div className="menu-group">Object Gizmos</div>
            <MenuCheck label="Light Helpers" checked={gizmos.lightHelpers} onChange={(v) => setGizmos({ lightHelpers: v })} />
            <MenuCheck label="Empties" checked={gizmos.empties} onChange={(v) => setGizmos({ empties: v })} />
          </div>
        </Dropdown>
        <Dropdown label="Overlays">
          <div className="menu-group">Guides</div>
          <MenuCheck label="Grid" checked={overlays.grid} onChange={(v) => setOverlays({ grid: v })} />
          <div className="menu-axes">
            <span>Axes</span>
            {(['axisX', 'axisY', 'axisZ'] as const).map((k) => (
              <button key={k} className={'axis-btn ' + k + (overlays[k] ? ' on' : '')} onClick={() => setOverlays({ [k]: !overlays[k] })}>
                {k.slice(-1)}
              </button>
            ))}
          </div>
          <div className="menu-group">Geometry</div>
          <MenuCheck label="Wireframe" checked={overlays.wireframe} onChange={(v) => setOverlays({ wireframe: v })} />
          <div className="menu-group">Output</div>
          <MenuCheck label="2D UI" checked={overlays.ui} onChange={(v) => setOverlays({ ui: v })} />
          <MenuCheck label="Aspect Ratio" checked={overlays.aspectRatio} onChange={(v) => setOverlays({ aspectRatio: v })} />
        </Dropdown>
        <Dropdown label="Render">
          <MenuRadio<Quality>
            label="Quality"
            value={settings.quality}
            options={[
              { value: 'high', label: 'High' },
              { value: 'low', label: 'Low' },
            ]}
            onChange={(v) => setSettings({ quality: v })}
          />
          <MenuRadio<Resolution>
            label="Resolution"
            value={settings.resolution}
            options={[
              { value: '1080p', label: res(1080) },
              { value: '720p', label: res(720) },
              { value: 'auto', label: 'Dynamic Resolution' },
            ]}
            onChange={(v) => setSettings({ resolution: v })}
          />
          <MenuRadio<boolean>
            label="Frame Rate"
            value={settings.limitFps}
            options={[
              { value: true, label: '30 fps' },
              { value: false, label: 'Unlimited' },
            ]}
            onChange={(v) => setSettings({ limitFps: v })}
          />
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => useStudio.setState({ renderSettingsOpen: true })}>
            Render Settings…
          </button>
        </Dropdown>
        <button className={stats ? 'on' : ''} onClick={() => useStudio.setState({ stats: !stats })}>
          Stats
        </button>
      </div>
      <div
        ref={areaRef}
        className={'viewport-area' + (mode === 'play' ? ' play' : '') + (dropOver ? ' drop' : '')}
        onPointerMove={(e) => trackMouse(e.nativeEvent)}
        onPointerLeave={leaveViewport}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DRAG_ASSET)) {
            e.preventDefault();
            setDropOver(true);
          }
        }}
        onDragLeave={() => setDropOver(false)}
        onDrop={onDrop}
        onContextMenu={(e) => e.preventDefault()}
      >
        {scene && area.width > 0 && (
          <StageEnvContext.Provider value={env}>
            <DataContext.Provider value={dataStore}>
              <PlaybackContext.Provider value={playback}>
                <FollowContext.Provider value={followStore}>
                  <ActivationContext.Provider value={activationStore}>
                    <EventContext.Provider value={events}>
                      <div className="canvas-box" style={canvasBox}>
                        <StageCanvas
                          stats={studioStats}
                          onPointerMissed={(e) => {
                            if (mode === 'edit' && e.button === 0 && !e.shiftKey && !e.altKey && !modal.active && !useStudio.getState().eyedropper) select([]);
                          }}
                        >
                          <EditorCamera />
                          <Selectable>
                            <SceneContent scene={scene} handle={handle} hidden={hidden} versions={versions} />
                            <Helpers />
                          </Selectable>
                          <Grid />
                          <Axes />
                          <SelectionBoxes />
                          <Gizmo />
                          <Wireframe />
                          {mode === 'play' && <CameraDirector cameras={scene.cameras} playback={playback} />}
                          <ActivationDirector tracks={scene.tracks} cameras={scene.cameras} playback={playback} handle={handle} time={mode === 'edit' ? (scrubT ?? 0) : undefined} />
                          <AnimationDirector tracks={scene.animations} cameras={scene.cameras} playback={playback} handle={handle} active={mode === 'play'} />
                          <EventDirector timelines={scene.timelines} tracks={scene.tracks} handle={handle} paused={paused} />
                          <FollowTracker />
                        </StageCanvas>
                        <OverlayFrame visible={overlays.ui} />
                        {mode === 'edit' && overlays.aspectRatio && <AspectMask width={canvasBox.width} height={canvasBox.height} stage={stage} label={aspectRatio.join(':')} />}
                      </div>
                      {stats && <StatsOverlay />}
                      <NavGizmo />
                      <ModalHint />
                    </EventContext.Provider>
                  </ActivationContext.Provider>
                </FollowContext.Provider>
              </PlaybackContext.Provider>
            </DataContext.Provider>
          </StageEnvContext.Provider>
        )}
        {!scene && <div className="empty">No Scene open</div>}
      </div>
    </div>
  );
}
