import { useEffect, useState } from 'react';
import { project } from 'virtual:three-stage/project';
import { registry } from '@three-stage/runtime';
import { lastScene, lastWritten, log, notify, openScene, refreshFiles, refreshGit, useStudio } from './store';
import { onFiles, onGitChange, readText, type FileEvent } from './api';
import { dataStore, startMockLoop } from './mock';
import { installKeys } from './keys';
import { Toolbar } from './panels/Toolbar';
import { Hierarchy } from './panels/Hierarchy';
import { Assets } from './panels/Assets';
import { Inspector } from './panels/Inspector';
import { Console } from './panels/Console';
import { Timeline } from './panels/Timeline';
import { DataPanel } from './panels/DataPanel';
import { Splitter, usePanelSizes } from './ui/Splitter';
import { RenderSettings } from './panels/RenderSettings';
import { Profiler } from './panels/Profiler';
import { Viewport } from './viewport/Viewport';
import { DialogHost } from './ui/Dialog';

async function boot() {
  await refreshGit();
  const files = await refreshFiles();
  const scenes = files.filter((f) => f.path.startsWith('scenes/') && f.path.endsWith('.stage.json'));
  const last = lastScene();
  const first = scenes.find((f) => f.path === last) ?? scenes[0];
  if (first) await openScene(first.path);
  else log('warn', 'No Scene found in content/scenes/');
  const s = useStudio.getState().scene;
  if (s?.cameras[0]) useStudio.setState({ cameraView: { id: s.cameras[0].id, n: Date.now() } });
  log('info', `Opened ${project.name}  ${project.dir}`);
}

// Some exporters write a file in several steps, firing several change events. Reading on the first can see a half-written file, so wait until they settle
const SETTLE_MS = 300;

/** Reloads whatever uses a changed file, including the open scene when it changed externally and has no unsaved changes */
function watchFiles() {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return onFiles((e) => {
    clearTimeout(timers.get(e.path));
    timers.set(
      e.path,
      setTimeout(() => {
        timers.delete(e.path);
        onFileSettled(e);
      }, SETTLE_MS),
    );
  });
}

async function onFileSettled(e: FileEvent) {
  const s = useStudio.getState();
  useStudio.setState((st) => ({ versions: { ...st.versions, [e.path]: e.mtime || Date.now() } }));
  await refreshFiles();
  if (e.path === s.scenePath && e.event === 'change') {
    if (e.mtime === s.savedMtime) return;
    // Even if git autocrlf turned line endings into CRLF, identical content is not treated as an external change
    const text = (await readText(e.path).catch(() => null))?.replace(/\r\n/g, '\n') ?? null;
    if (text === null || text === s.savedText || text === lastWritten()) return;
    if (s.dirty) {
      useStudio.setState({ externalChange: true });
      log('warn', `${e.path} was changed externally. Not reloaded because there are unsaved changes`);
    } else {
      await openScene(e.path, { keepHistory: true });
      log('info', `${e.path} was changed externally and has been reloaded`);
    }
  } else if (e.event !== 'unlink' && !e.path.startsWith('scenes/')) {
    log('info', e.event === 'add' ? `${e.path} was added` : `Reloaded ${e.path}`, { kind: 'asset', path: e.path });
  }
}

function Toast() {
  const toast = useStudio((s) => s.toast);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    setShown(toast.n);
    const id = setTimeout(() => setShown(null), toast.level === 'error' ? 8000 : 4000);
    return () => clearTimeout(id);
  }, [toast]);
  if (!toast || shown !== toast.n) return null;
  return (
    <div className={'toast ' + toast.level} onClick={() => setShown(null)}>
      {toast.text}
    </div>
  );
}

export function Studio() {
  useEffect(() => {
    // Even if hot reload loads this file again, run the startup only once.
    // A second run would discard unsaved changes in the reopened scene and attach the key handlers twice
    const w = window as any;
    if (w.__threeStageBooted) return;
    w.__threeStageBooted = true;
    installKeys();
    startMockLoop();
    boot();
    watchFiles();
    onGitChange(async () => {
      const before = useStudio.getState().git?.branch;
      const g = await refreshGit();
      if (g?.branch && g.branch !== before) notify('info', `Switched to branch ${g.branch}`);
    });
    dataStore.onReceive((value, at) => {
      if (useStudio.getState().mode !== 'play' || at === null) return;
      const m = registry.mock();
      const hh = new Date(at).toTimeString().slice(0, 5);
      log('info', `Received ${hh}${m?.summary ? '  ' + m.summary(value) : ''}`);
    });
    window.addEventListener('beforeunload', (e) => {
      if (useStudio.getState().dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    window.addEventListener('error', (e) => log('error', String(e.message)));
    window.addEventListener('unhandledrejection', (e) => log('error', String(e.reason?.message ?? e.reason)));
  }, []);

  const bottomTab = useStudio((s) => s.bottomTab);
  const eyedropper = useStudio((s) => !!s.eyedropper);
  const [sizes, resize] = usePanelSizes();

  useEffect(() => {
    document.title = `${project.name} — THREE Stage`;
  }, []);

  return (
    <div className={'studio' + (eyedropper ? ' picking' : '')}>
      <Toolbar />
      <div className="main" style={{ gridTemplateColumns: `minmax(0, 1fr) 4px ${sizes.mid}px 4px ${sizes.right}px` }}>
        <div className="left">
          <Viewport />
          <Splitter axis="y" onDrag={(d) => resize('bottom', -d)} />
          <div className="bottom panel" style={{ height: sizes.bottom }}>
            <div className="panel-head tabs">
              {(
                [
                  ['timeline', 'Timeline'],
                  ['data', 'Data'],
                  ['console', 'Console'],
                  ['profiler', 'Profiler'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className={'tab' + (bottomTab === k ? ' on' : '')} onClick={() => useStudio.setState({ bottomTab: k })}>
                  {label}
                </button>
              ))}
            </div>
            <div className="panel-body">
              {bottomTab === 'timeline' ? <Timeline /> : bottomTab === 'data' ? <DataPanel /> : bottomTab === 'console' ? <Console /> : <Profiler />}
            </div>
          </div>
        </div>
        <Splitter axis="x" onDrag={(d) => resize('mid', -d)} />
        <div className="mid" style={{ gridTemplateRows: `${sizes.hierarchy}px 4px minmax(0, 1fr)` }}>
          <Hierarchy />
          <Splitter axis="y" onDrag={(d) => resize('hierarchy', d)} />
          <Assets />
        </div>
        <Splitter
          axis="x"
          onDrag={(d) => {
            resize('mid', d);
            resize('right', -d);
          }}
        />
        <div className="right">
          <Inspector />
        </div>
      </div>
      {eyedropper && (
        <div className="picking-hint">
          Click an object in the Viewport to pick it <span className="menu-side">Esc to cancel</span>
        </div>
      )}
      <Toast />
      <RenderSettings />
      <DialogHost />
    </div>
  );
}
