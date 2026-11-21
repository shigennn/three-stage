import { normalizeScene, type StageSceneDef } from './schema';

const round = (n: number) => {
  const r = Math.round(n * 10000) / 10000;
  return Object.is(r, -0) ? 0 : r;
};

function write(v: unknown, indent: string): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(round(v));
  if (typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  const next = indent + '  ';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (v.every((x) => typeof x === 'number')) return '[' + v.map((x) => String(round(x as number))).join(', ') + ']';
    if (v.every((x) => typeof x === 'string') && v.join('').length < 60) return '[' + v.map((x) => JSON.stringify(x)).join(', ') + ']';
    return '[\n' + v.map((x) => next + write(x, next)).join(',\n') + '\n' + indent + ']';
  }
  const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
  if (entries.length === 0) return '{}';
  return '{\n' + entries.map(([k, x]) => next + JSON.stringify(k) + ': ' + write(x, next)).join(',\n') + '\n' + indent + '}';
}

/**
 * Returns the scene definition as *.stage.json text.
 * The output is stable across saves (fixed key order, numbers rounded to 4 decimals, number arrays on one line) so git diffs stay readable.
 */
export function serializeScene(scene: StageSceneDef): string {
  const s = normalizeScene(JSON.parse(JSON.stringify(scene)));
  s.overrides = Object.fromEntries(Object.entries(s.overrides).sort(([a], [b]) => a.localeCompare(b)));
  return write(s, '') + '\n';
}
