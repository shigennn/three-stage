import { createContext, useContext, useEffect } from 'react';

// Holds the received data. Per-frame motion reads store.value directly inside useFrame instead of going through React state.

/** Called when new data is received. */
export type ReceiveListener = (value: unknown, receivedAt: number | null) => void;
/** `received` tells whether the receive time changed. `silent` marks an update that shows no receive effect (the studio's time slider). */
export type SetListener = (value: unknown, received: boolean, silent: boolean) => void;

/**
 * Returns the time `minutes` minutes after midnight today (epoch milliseconds).
 * Turns "minutes since midnight" in mock data into a receive time.
 */
export function todayAt(minutes: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() + minutes * 60000;
}

/** Holds the latest data and notifies listeners when new data is received. */
export class DataStore {
  /** The latest data. */
  value: unknown = null;
  /** When the data was received (epoch milliseconds). */
  receivedAt: number | null = null;
  private listeners = new Set<ReceiveListener>();
  private setListeners = new Set<SetListener>();

  /**
   * Replaces the data. Receive listeners are called only when `receivedAt` changes.
   * @param silent Shows no receive effect (used while the time slider in the studio is moving).
   */
  set(value: unknown, receivedAt: number | null, silent = false) {
    const changed = receivedAt !== this.receivedAt;
    this.value = value;
    this.receivedAt = receivedAt;
    this.setListeners.forEach((f) => f(value, changed && receivedAt !== null, silent));
    if (changed && receivedAt !== null && !silent) this.emit();
  }

  /** Calls `f` on every update. Used by Triggers that compare data before and after a receive. Returns a function that removes the listener. */
  onSet(f: SetListener) {
    this.setListeners.add(f);
    return () => {
      this.setListeners.delete(f);
    };
  }

  /** Shows the receive effect now, without waiting for the next receive. */
  fire() {
    this.emit();
  }

  /** Calls `f` each time new data is received. Returns a function that removes the listener. */
  onReceive(f: ReceiveListener) {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  }

  private emit() {
    this.listeners.forEach((f) => f(this.value, this.receivedAt));
  }
}

/** Provides the {@link DataStore} of the current view. */
export const DataContext = createContext<DataStore>(new DataStore());

/** Returns the {@link DataStore} of the current view. Read `.value` inside useFrame; it does not trigger re-renders. */
export function useStageData(): DataStore {
  return useContext(DataContext);
}

/** Calls `f` each time new data is received, while the calling component is mounted. Keep `f` stable (useCallback) to avoid resubscribing. */
export function useReceive(f: ReceiveListener) {
  const store = useStageData();
  useEffect(() => store.onReceive(f), [store, f]);
}

const PATH = /([^.[\]]+)|\[(\d+)\]|\[([^=\]]+)=([^\]]*)\]/g;
type Key = string | number | { field: string; value: string };
// Components call getPath every frame, so the parsed paths are cached (running the regular expression every frame creates garbage).
const parsed = new Map<string, Key[]>();

function keysOf(path: string) {
  let keys = parsed.get(path);
  if (!keys) {
    keys = [...path.matchAll(PATH)].map((m) => (m[1] !== undefined ? m[1] : m[2] !== undefined ? Number(m[2]) : { field: m[3], value: m[4] }));
    if (parsed.size > 1000) parsed.clear();
    parsed.set(path, keys);
  }
  return keys;
}

/**
 * Returns the value at a path such as `total.value` or `items[id=A-03].value`, or undefined if there is none.
 * `[id=A-03]` finds the array element whose id is A-03. Indexes (`items[3]`) work too, but don't use them for data whose order is not fixed.
 */
export function getPath(data: unknown, path: string): unknown {
  if (!path) return undefined;
  let cur: any = data;
  for (const k of keysOf(path)) {
    if (cur == null) return undefined;
    if (typeof k === 'object') {
      if (!Array.isArray(cur)) return undefined;
      cur = cur.find((x) => x != null && String(x[k.field]) === k.value);
    } else cur = cur[k];
  }
  return cur;
}

/**
 * Lists the paths that hold numbers and strings in a data sample (for choosing bindings in the Inspector).
 * Elements of arrays that have an id are addressed by id. At most 16 elements per array and `limit` paths in total are listed.
 */
export function listPaths(data: unknown, limit = 400): string[] {
  const out: string[] = [];
  const walk = (v: unknown, p: string) => {
    if (out.length >= limit) return;
    if (Array.isArray(v)) {
      v.slice(0, 16).forEach((x, i) => walk(x, x && typeof x === 'object' && 'id' in x ? `${p}[id=${(x as { id: unknown }).id}]` : `${p}[${i}]`));
      if (p) out.push(`${p}.length`);
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k);
    } else if (p) {
      out.push(p);
    }
  };
  walk(data, '');
  return out;
}
