// Calls the studio dev server endpoints (packages/studio/server/plugin.mjs).

export interface FileInfo {
  path: string;
  size: number;
  mtime: number;
  triangles?: number | null;
}

export interface FileEvent {
  event: 'add' | 'change' | 'unlink';
  path: string;
  mtime: number;
}

export const contentUrl = (path: string) => '/content/' + path.split('/').map(encodeURIComponent).join('/');

/** Draco and Basis decoder URLs, served by the studio server. Publish copies the decoders into the scene bundle */
export const DECODERS = { draco: '/@stage/decoders/draco/', basis: '/@stage/decoders/basis/' };

export async function listFiles(): Promise<{ project: { name: string; dir: string }; files: FileInfo[] }> {
  const r = await fetch('/@stage/files', { cache: 'no-store' });
  return r.json();
}

export async function readText(path: string): Promise<string> {
  const r = await fetch(contentUrl(path), { cache: 'no-store' });
  if (!r.ok) throw new Error(`Cannot load ${path}: ${r.status}`);
  return r.text();
}

export async function saveText(path: string, text: string): Promise<{ mtime: number }> {
  const r = await fetch('/@stage/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, text }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || String(r.status));
  return j;
}

/** Copies a file dropped from the OS file manager into its folder under content/. Asks before overwriting a file with the same name */
export async function importFile(file: File, confirmOverwrite: (path: string) => Promise<boolean>): Promise<string | null> {
  const post = (overwrite: boolean) =>
    fetch(`/@stage/import?name=${encodeURIComponent(file.name)}${overwrite ? '&overwrite=1' : ''}`, { method: 'POST', body: file });
  let r = await post(false);
  if (r.status === 409) {
    const j = await r.json();
    if (!(await confirmOverwrite(j.path))) return null;
    r = await post(true);
  }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `Cannot import ${file.name}: ${r.status}`);
  return j.path;
}

export interface PublishResult {
  ok: boolean;
  outDir: string;
  files: number;
  bytes: number;
  errors: string[];
}

/** Checks and publishes the saved scene definition (packages/studio/server/registered.mjs) */
export async function publishScene(scene: string): Promise<PublishResult> {
  const r = await fetch('/@stage/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scene }) });
  return r.json();
}

export interface GitStatus {
  repo: boolean;
  branch?: string;
  detached?: boolean;
  defaultBranch?: string | null;
  /** On the default branch, or not on any branch. Editing and saving are disabled */
  readOnly?: boolean;
  branches?: string[];
  /** Branches that exist only on origin */
  remote?: string[];
  changed?: string[];
}

async function gitCall<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || String(r.status));
  return j;
}

/** Git state of the project folder (packages/studio/server/git.mjs) */
export const gitStatus = () => gitCall<GitStatus>('/@stage/git');
export const gitFetch = () => gitCall<GitStatus>('/@stage/git/fetch', {});
export const gitCheckout = (branch: string) => gitCall<{ openDir?: string }>('/@stage/git/checkout', { branch });
export const gitCreate = (name: string) => gitCall<{ ok: true }>('/@stage/git/create', { name });

/** Calls `f` when the branch is switched outside the studio */
export function onGitChange(f: () => void) {
  import.meta.hot?.on('stage:git', f);
}

export function reveal(path: string) {
  return fetch('/@stage/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
}

export function onFiles(f: (e: FileEvent) => void) {
  if (!import.meta.hot) return () => {};
  import.meta.hot.on('stage:files', f);
  return () => import.meta.hot?.off('stage:files', f);
}
