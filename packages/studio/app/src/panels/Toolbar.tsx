import { useState } from 'react';
import { log, notify, openScene, refreshGit, reload, save, saveAs, setPlaying, useStudio } from '../store';
import { gitCheckout, gitCreate, gitFetch, publishScene } from '../api';
import { askSave, askText } from '../ui/Dialog';
import { FullscreenIcon } from '../ui/icons';
import { enterFullscreen } from '../viewport/fullscreen';
import iconUrl from '../assets/icon-dark.svg?url';

// Toolbar: the open scene on the left, playback in the middle, Save and Publish on the right. Mock data controls live in the Data tab.

const fileName = (path: string) => path.replace(/^scenes\//, '');
const stageName = (path: string) => fileName(path).replace(/\.stage\.json$/, '');

async function runPublish() {
  const s = useStudio.getState();
  if (!s.scenePath) return;
  if (s.dirty && !(await askSave(`Save changes to ${fileName(s.scenePath)} before publishing?`, save))) return;
  // The server checks the saved file against the registrations of the built package, not the ones loaded in this page
  // (packages/studio/server/registered.mjs). Loading the project code there takes a few seconds.
  notify('info', `Publishing ${fileName(s.scenePath)}`);
  try {
    const r = await publishScene(s.scenePath);
    if (!r.ok) {
      r.errors.forEach((e) => notify('error', `Cannot publish: ${e}`));
      useStudio.setState({ bottomTab: 'console' });
      return;
    }
    notify('info', `Published  ${r.outDir}  ${r.files} files  ${(r.bytes / 1048576).toFixed(1)} MB`);
  } catch (e: any) {
    notify('error', `Cannot publish: ${e.message}`);
  }
}

/** If there are unsaved changes, asks whether to save them. Returns true if it is OK to proceed */
export async function confirmDiscard() {
  const s = useStudio.getState();
  if (!s.dirty || !s.scenePath) return true;
  return askSave(`Save changes to ${fileName(s.scenePath)}?`, save);
}

/** After switching branches the scene and the code are both different, so reload the whole page */
function reloadForBranch() {
  // The user already chose not to save, so don't show the window's unsaved-changes prompt again
  useStudio.setState({ dirty: false });
  location.reload();
}

async function switchBranch(name: string) {
  if (!(await confirmDiscard())) return;
  try {
    const r = await gitCheckout(name);
    if (r.openDir) {
      // git won't switch to a branch that is checked out in another folder (worktree), so open that folder instead
      if (window.threeStage) {
        useStudio.setState({ dirty: false });
        const o = await window.threeStage.open(r.openDir);
        if (o.error) notify('error', o.error);
      } else notify('warn', `${name} is checked out in another folder. Open ${r.openDir}`);
      return;
    }
    reloadForBranch();
  } catch (e: any) {
    notify('error', e.message);
  }
}

async function newBranch() {
  const g = useStudio.getState().git;
  if (!g?.repo || !(await confirmDiscard())) return;
  const taken = new Set([...(g.branches ?? []), ...(g.remote ?? [])]);
  const name = await askText(
    'New Branch',
    {
      label: 'Branch Name',
      value: '',
      check: (v) => {
        if (!v) return 'Enter a name';
        if (/\s/.test(v)) return 'Spaces are not allowed';
        if (taken.has(v)) return 'A branch with this name already exists';
        return null;
      },
    },
    'Create',
  );
  if (!name) return;
  try {
    await gitCreate(name);
    reloadForBranch();
  } catch (e: any) {
    notify('error', e.message);
  }
}

/** The current branch, with a menu to switch or create one. Hidden when the folder is not a git repository */
function BranchMenu() {
  const git = useStudio((s) => s.git);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  if (!git?.repo) return null;
  const toggle = (e: React.MouseEvent) => {
    if (at) return setAt(null);
    // The Toolbar has overflow: hidden, so position the menu relative to the window
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAt({ left: r.left, top: r.bottom + 2 });
    refreshGit();
    // Also list branches created elsewhere, such as on the remote. If fetching fails, still list the local ones
    gitFetch()
      .then((g) => useStudio.setState({ git: g }))
      .catch((err) => log('warn', err.message));
  };
  const pick = (f: () => void) => () => {
    setAt(null);
    f();
  };
  return (
    <>
      <span className="tb-label">Branch</span>
      <button className={'branch' + (git.readOnly ? ' read-only' : '')} onClick={toggle} title={git.readOnly ? 'Read-only. To edit, create or select a branch' : 'Switch branch'}>
        {git.branch}
        {git.readOnly && <span className="badge">Read Only</span>}
        <span className="caret">▾</span>
      </button>
      {at && (
        <div className="menu dropdown branch-menu" style={{ position: 'fixed', left: at.left, top: at.top, right: 'auto' }} onMouseLeave={() => setAt(null)}>
          {(git.branches ?? []).map((b) => (
            <button key={b} className="menu-item" disabled={b === git.branch} onClick={pick(() => switchBranch(b))}>
              {b === git.branch ? '✓ ' : ' '}
              {b}
              {b === git.defaultBranch && <span className="menu-side">Read Only</span>}
            </button>
          ))}
          {(git.remote ?? []).map((b) => (
            <button key={'origin/' + b} className="menu-item" onClick={pick(() => switchBranch(b))}>
              {' '}
              {b}
              <span className="menu-side">origin</span>
            </button>
          ))}
          <div className="menu-sep" />
          <button className="menu-item" onClick={pick(newBranch)} disabled={!git.defaultBranch}>
            New Branch…
            {git.defaultBranch && <span className="menu-side">from {git.defaultBranch}</span>}
          </button>
        </div>
      )}
    </>
  );
}

export function Toolbar() {
  const project = useStudio((s) => s.project);
  const files = useStudio((s) => s.files);
  const scenePath = useStudio((s) => s.scenePath);
  const mode = useStudio((s) => s.mode);
  const paused = useStudio((s) => s.paused);
  const dirty = useStudio((s) => s.dirty);
  const externalChange = useStudio((s) => s.externalChange);
  const readOnly = useStudio((s) => !!s.git?.readOnly);
  const stages = files.filter((f) => f.path.startsWith('scenes/') && f.path.endsWith('.stage.json'));

  const saveAsNew = async () => {
    if (!scenePath) return;
    const name = await askText(
      'Save As',
      {
        label: 'File Name',
        value: stageName(scenePath) + '-copy',
        suffix: '.stage.json',
        check: (v) => {
          if (!v) return 'Enter a name';
          if (/[\\/:*?"<>|]/.test(v)) return 'File names cannot contain: \\ / : * ? " < > |';
          if (stages.some((f) => f.path === `scenes/${v}.stage.json`)) return 'A file with this name already exists';
          return null;
        },
      },
      'Save',
    );
    if (name) await saveAs(`scenes/${name}.stage.json`);
  };

  return (
    <div className="toolbar">
      <div className="tb-side">
        <img src={iconUrl} className="logo" alt="" />
        {window.threeStage ? (
          <button
            className="project home"
            title={`${project?.dir ?? ''}\nBack to the start screen`}
            onClick={async () => {
              if (!(await confirmDiscard())) return;
              // The user already chose not to save, so don't show the window's unsaved-changes prompt again
              useStudio.setState({ dirty: false });
              window.threeStage?.home();
            }}
          >
            {project?.name}
          </button>
        ) : (
          <span className="project" title={project?.dir}>
            {project?.name}
          </span>
        )}
        <div className="sep" />
        <span className="tb-label">Scene</span>
        <select
          className="scene-select"
          value={scenePath ?? ''}
          onChange={async (e) => {
            const next = e.target.value;
            if (await confirmDiscard()) openScene(next);
          }}
          title={scenePath ? `content/${scenePath}` : undefined}
        >
          {stages.map((f) => (
            <option key={f.path} value={f.path}>
              {fileName(f.path)}
            </option>
          ))}
        </select>
        {dirty && (
          <span className="dirty-mark" title="Unsaved changes">
            ●
          </span>
        )}
        <div className="sep" />
        <BranchMenu />
      </div>

      <div className="seg play-controls">
        <button className={mode === 'play' ? 'on' : ''} onClick={() => setPlaying(mode !== 'play')} title="Play  Space">
          ▶
        </button>
        <button className={paused ? 'on' : ''} onClick={() => useStudio.setState({ paused: !paused })} title="Pause  Also stops code-driven motion and Clips">
          ❚❚
        </button>
        <button onClick={enterFullscreen} disabled={!scenePath} title="Fullscreen  F11  Plays the scene in fullscreen, without the editor. Esc to exit">
          <FullscreenIcon />
        </button>
      </div>

      <div className="tb-side tb-end">
        {externalChange && (
          <>
            <span className="external">The file was changed externally</span>
            <button onClick={reload} title="Reload from the file. Unsaved changes are lost">
              Reload
            </button>
          </>
        )}
        <button onClick={save} disabled={!dirty || readOnly} title="Ctrl+S">
          Save
        </button>
        <button onClick={saveAsNew} disabled={!scenePath || readOnly}>
          Save As…
        </button>
        <button onClick={runPublish} disabled={!scenePath}>
          Publish
        </button>
      </div>
    </div>
  );
}
