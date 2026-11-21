// git operations behind the studio Toolbar's branch menu: show, switch and create branches. Never commits or pushes.
// Switching checks out the whole repository, even when the project is a subfolder of it.
// The default branch is read-only in the studio; saving requires another branch.
import { spawnSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';

function git(cwd, args, timeout = 15000) {
  // A credential prompt would hang inside a server with no terminal, so fail instead of asking
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), raw: r.stdout ?? '', err: (r.stderr || r.error?.message || '').trim() };
}

const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function defaultBranch(cwd, locals) {
  const r = git(cwd, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (r.ok && r.out.startsWith('origin/')) return r.out.slice('origin/'.length);
  return ['main', 'master'].find((b) => locals.includes(b)) ?? null;
}

/** Branches checked out in other worktrees → the worktree folder */
function otherWorktrees(cwd, top) {
  const out = new Map();
  let path = null;
  for (const l of lines(git(cwd, ['worktree', 'list', '--porcelain']).out)) {
    if (l.startsWith('worktree ')) path = resolve(l.slice('worktree '.length));
    else if (l.startsWith('branch refs/heads/') && path && path !== resolve(top)) out.set(l.slice('branch refs/heads/'.length), path);
  }
  return out;
}

/** @param {string} projectDir */
export function gitStatus(projectDir) {
  const top = git(projectDir, ['rev-parse', '--show-toplevel']);
  if (!top.ok) return { repo: false };
  const head = git(projectDir, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const detached = !head.ok;
  const branch = detached ? git(projectDir, ['rev-parse', '--short', 'HEAD']).out : head.out;
  const locals = lines(git(projectDir, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).out);
  const remote = lines(git(projectDir, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin']).out)
    .filter((r) => r.startsWith('origin/') && r !== 'origin/HEAD')
    .map((r) => r.slice('origin/'.length))
    .filter((r) => !locals.includes(r));
  const def = defaultBranch(projectDir, locals);
  // Untracked files are left out: checkout carries them over, and git itself refuses when one would be overwritten.
  // Don't trim the lines: the first two characters are the status, and ' M' starts with a space.
  const changed = git(projectDir, ['status', '--porcelain', '--untracked-files=no'])
    .raw.split('\n')
    .filter((l) => l.length > 3)
    .map((l) => l.slice(3).trim());
  return {
    repo: true,
    top: resolve(top.out),
    branch,
    detached,
    defaultBranch: def,
    readOnly: detached || branch === def,
    branches: locals,
    remote,
    worktrees: Object.fromEntries(otherWorktrees(projectDir, top.out)),
    changed,
  };
}

/** Fetches origin so branches created elsewhere appear in gitStatus */
export function gitFetch(projectDir) {
  const r = git(projectDir, ['fetch', '--prune', 'origin'], 30000);
  if (!r.ok) throw new Error(`Cannot fetch from origin: ${r.err}`);
}

function needClean(s) {
  if (!s.changed.length) return;
  const list = s.changed.slice(0, 5).join(', ') + (s.changed.length > 5 ? ` and ${s.changed.length - 5} more` : '');
  throw new Error(`Cannot switch branches with uncommitted changes (${list}). Commit or revert them first`);
}

/**
 * Switches branches. git refuses to check out a branch that another worktree has checked out, so the same project inside that worktree is returned instead
 * @returns {{ openDir?: string }}
 */
export function gitCheckout(projectDir, name) {
  const s = gitStatus(projectDir);
  if (!s.repo) throw new Error('Not a git repository');
  if (name === s.branch) return {};
  const wt = s.worktrees[name];
  if (wt) return { openDir: join(wt, relative(s.top, resolve(projectDir))) };
  const local = s.branches.includes(name);
  if (!local && !s.remote.includes(name)) throw new Error(`Branch ${name} does not exist`);
  needClean(s);
  const r = local ? git(projectDir, ['checkout', name]) : git(projectDir, ['checkout', '-b', name, '--track', `origin/${name}`]);
  if (!r.ok) throw new Error(`Cannot switch branches: ${r.err}`);
  return {};
}

/** Creates a new branch from the default branch (the latest on origin, if it can be fetched) and switches to it */
export function gitCreate(projectDir, name) {
  name = String(name ?? '').trim();
  const s = gitStatus(projectDir);
  if (!s.repo) throw new Error('Not a git repository');
  if (!name || name.startsWith('-') || !git(projectDir, ['check-ref-format', '--branch', name]).ok) throw new Error(`${name} is not a valid branch name`);
  if (s.branches.includes(name) || s.remote.includes(name)) throw new Error(`Branch ${name} already exists`);
  if (!s.defaultBranch) throw new Error('Cannot find the default branch (main) to branch from');
  needClean(s);
  git(projectDir, ['fetch', 'origin', s.defaultBranch], 30000);
  const base = git(projectDir, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${s.defaultBranch}`]).ok ? `origin/${s.defaultBranch}` : s.defaultBranch;
  const r = git(projectDir, ['checkout', '--no-track', '-b', name, base]);
  if (!r.ok) throw new Error(`Cannot create the branch: ${r.err}`);
}

/** The HEAD file. Watched to notice a branch switch made outside the studio */
export function gitHeadFile(projectDir) {
  const r = git(projectDir, ['rev-parse', '--path-format=absolute', '--git-path', 'HEAD']);
  return r.ok ? r.out : null;
}
