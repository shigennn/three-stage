import { defineMockData, todayAt } from '@three-stage/runtime';
import type { Frame } from '../data';

export function frameAt(minutes: number): Frame {
  const level = Math.round(50 + 40 * Math.sin(minutes / 60));
  return { measuredAt: todayAt(minutes), level, items: [{ id: 'A', active: true, value: 1 }, { id: 'B', active: minutes % 120 < 60, value: 2 }, { id: 'C', active: true, value: 3 }] };
}

defineMockData({
  variantLabel: 'Variant',
  variants: [{ id: 'default', label: 'Default' }],
  sample: (m) => ({ value: frameAt(m), receivedAt: m }),
});
