// The Electron main process: the start screen, and the chosen project's studio server opened in the same window.
// The entry point for both `npm run app` and the installed exe.
import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStudio } from '../server/studio-server.mjs';
import { createProject, projectNameFrom, readProject } from '../server/project.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// Without this, Chromium rounds performance.memory (used by Stats and the Profiler)
app.commandLine.appendSwitch('enable-precise-memory-info');

/** @type {BrowserWindow | null} */
let win = null;
let studio = null;

const settingsFile = () => join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try {
    return JSON.parse(readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeSettings(s) {
  mkdirSync(dirname(settingsFile()), { recursive: true });
  writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}

function remember(dir, name) {
  const s = readSettings();
  s.recent = [{ dir, name, openedAt: Date.now() }, ...(s.recent ?? []).filter((r) => r.dir !== dir)].slice(0, 20);
  writeSettings(s);
}

async function closeServer(s) {
  if (s) await s.server.close();
}

async function showStart() {
  const prev = studio;
  try {
    await win.loadFile(join(here, 'start.html'));
  } catch {
    // Choosing Cancel in the unsaved-changes prompt aborts the load. Keep the studio open
    return;
  }
  studio = null;
  win.setTitle('THREE Stage');
  await closeServer(prev);
}

async function openProject(dir) {
  dir = resolve(dir);
  const p = readProject(dir);
  if (!p.ok) throw new Error(`${dir} is not a THREE Stage project. It needs three-stage.json, src/stage.ts and content/`);
  const prev = studio;
  const next = await startStudio({ projectDir: dir });
  try {
    await win.loadURL(next.url);
  } catch (e) {
    await closeServer(next);
    throw e;
  }
  studio = next;
  remember(dir, p.name);
  await closeServer(prev);
}

/** Calls from the start screen. Failures are shown on screen, so they are returned as { error } instead of thrown */
const handle = (name, f) =>
  ipcMain.handle(name, async (_e, ...args) => {
    try {
      return { ok: await f(...args) };
    } catch (e) {
      return { error: String(e?.message ?? e) };
    }
  });

handle('stage:recent', () => (readSettings().recent ?? []).map((r) => ({ ...r, exists: readProject(r.dir).ok })));
handle('stage:default-location', () => readSettings().lastLocation ?? join(defaultParent(), 'THREE Stage'));

/** app.getPath('documents') throws on some machines ("Failed to get 'documents' path") */
function defaultParent() {
  try {
    return app.getPath('documents');
  } catch {
    return app.getPath('home');
  }
}
handle('stage:pick-folder', async (defaultPath) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath });
  return r.canceled ? null : r.filePaths[0];
});
handle('stage:create', async (location, name, template) => {
  if (!location || !name) throw new Error('Enter a name and a location');
  if (/[\\/:*?"<>|]/.test(name)) throw new Error('The name cannot contain any of these characters: \\ / : * ? " < > |');
  const dir = join(location, name);
  createProject(dir, projectNameFrom(name), template);
  writeSettings({ ...readSettings(), lastLocation: location });
  await openProject(dir);
});
handle('stage:open', (dir) => openProject(dir));
handle('stage:open-dialog', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (!r.canceled) await openProject(r.filePaths[0]);
});
handle('stage:forget', (dir) => {
  const s = readSettings();
  writeSettings({ ...s, recent: (s.recent ?? []).filter((r) => r.dir !== dir) });
});
handle('stage:home', () => showStart());

/**
 * In the installed exe, makes the `three-stage` command available everywhere.
 * Windows puts %LOCALAPPDATA%\Microsoft\WindowsApps on the user's PATH by default
 */
function registerCommand() {
  if (!app.isPackaged || process.platform !== 'win32' || !process.env.LOCALAPPDATA) return;
  const text = `@"${join(process.resourcesPath, 'bin', 'three-stage.cmd')}" %*\r\n`;
  const shim = join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'three-stage.cmd');
  try {
    if (!existsSync(shim) || readFileSync(shim, 'utf8') !== text) writeFileSync(shim, text);
  } catch {}
}

/** The project folder is the 1st argument in the exe and the 2nd with `electron main.mjs` */
function projectArg() {
  return process.argv.slice(app.isPackaged ? 1 : 2).find((a) => !a.startsWith('-'));
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  registerCommand();
  // Show the window right away with a background color. Don't wait for ready-to-show: in the installed exe it never fires
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    backgroundColor: '#1b1c1e',
    title: 'THREE Stage',
    icon: join(here, 'icon.png'),
    webPreferences: { preload: join(here, 'preload.cjs') },
  });
  win.maximize();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // The studio blocks unloading while there are unsaved changes. Electron shows no prompt for beforeunload, so it is shown here
  win.webContents.on('will-prevent-unload', (e) => {
    const r = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ["Don't Save", 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'THREE Stage',
      message: 'You have unsaved changes.',
      detail: 'If you close, your unsaved changes will be lost.',
    });
    if (r === 0) e.preventDefault();
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
  win.on('closed', () => {
    const s = studio;
    studio = null;
    win = null;
    closeServer(s).finally(() => app.quit());
  });

  const arg = projectArg();
  if (arg) {
    try {
      await openProject(arg);
      return;
    } catch (e) {
      dialog.showErrorBox('THREE Stage', String(e?.message ?? e));
    }
  }
  await showStart();
});

app.on('window-all-closed', () => app.quit());
