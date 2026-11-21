import { getPath } from './data';
import { defineTrigger } from './registry';

// Triggers built into the runtime. Projects add others with defineTrigger.

type ListChange = { list: string; key: string; field: string; from: string; to: string };

function items(data: unknown, list: string): any[] {
  const v = getPath(data, list);
  return Array.isArray(v) ? v : [];
}

const valueOf = (item: unknown, field: string) => String(getPath(item, field));

/**
 * Fires with an item's Key when a field of that item in a list (such as `items`) changes. With `from` and `to`, it fires only on a change from that value to that value.
 * With `from` set, an item missing from the previous update does not fire (an item that was just added to the list, or one the source omitted from the previous update).
 */
defineTrigger<ListChange>({
  type: 'stage.listChange',
  label: 'List Change',
  params: {
    list: { type: 'text', default: '', label: 'List' },
    key: { type: 'text', default: 'id', label: 'Key' },
    field: { type: 'text', default: '', label: 'Field' },
    from: { type: 'text', default: '', label: 'From' },
    to: { type: 'text', default: '', label: 'To' },
  },
  detect(prev, next, p) {
    if (!p.list || !p.field) return [];
    const before = new Map<string, unknown>();
    for (const x of items(prev, p.list)) if (x != null) before.set(String(x[p.key]), x);
    const out: string[] = [];
    for (const x of items(next, p.list)) {
      if (x == null) continue;
      const k = String(x[p.key]);
      const was = before.get(k);
      if (was === undefined && p.from) continue;
      const old = was === undefined ? undefined : valueOf(was, p.field);
      const now = valueOf(x, p.field);
      if (old === now) continue;
      if (p.from && old !== p.from) continue;
      if (p.to && now !== p.to) continue;
      out.push(k);
    }
    return out;
  },
  keys(data, p) {
    return items(data, p.list)
      .filter((x) => x != null)
      .map((x) => String(x[p.key]));
  },
});
