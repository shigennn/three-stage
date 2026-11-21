import { defineMockData, todayAt } from '@three-stage/runtime';
import { levelLabel, type SampleFrame } from '../data';

// A made-up day of data for the studio's Data tab. The level is low at night and peaks around 10:00 and 15:00.
// Export mockFrameAt, not defineMockData's return value: the latter would put runtime types into the package's .d.ts,
// and the host app doesn't have them.

/** Minutes between receives. */
const CADENCE = 1;

const bump = (h: number, at: number, width: number) => Math.exp(-(((h - at) / width) ** 2));

function frameAt(m: number): SampleFrame {
  const h = m / 60;
  const daytime = 1 / (1 + Math.exp(-(h - 7) * 2)) / (1 + Math.exp((h - 20) * 2));
  const level = 12 + 25 * daytime + 30 * bump(h, 10, 1.2) + 45 * bump(h, 15, 1) + 4 * Math.sin(m * 0.7);
  return { measuredAt: todayAt(m), level: Math.min(100, Math.max(0, Math.round(level))) };
}

const receivedAt = (minutes: number) => Math.min(1439, Math.floor(minutes / CADENCE) * CADENCE);

/** Returns the frame received by `minutes` (minutes since midnight). For feeding mock data in the host app. */
export function mockFrameAt(minutes: number): SampleFrame {
  return frameAt(receivedAt(minutes));
}

defineMockData({
  variantLabel: 'Variant',
  variants: [{ id: 'default', label: 'Default' }],
  sample(minutes) {
    const at = receivedAt(minutes);
    return { value: frameAt(at), receivedAt: at };
  },
  summary(value) {
    const { level } = value as SampleFrame;
    return `${level} ${levelLabel(level)}`;
  },
});
