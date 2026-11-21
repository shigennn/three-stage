/** One frame of data. The host app converts its own data to this shape and passes it to `SampleStage`. */
export interface SampleFrame {
  /** When the value was measured (epoch milliseconds). */
  measuredAt: number;
  /** A value from 0 to 100. Drives the balls' speed, the floor grid, the accent color, the sky and the tint. */
  level: number;
}

/** Labels a level for the 2D UI and the mock data summary. */
export function levelLabel(level: number) {
  return level < 40 ? 'Low' : level < 70 ? 'Medium' : 'High';
}

/** Maps a level to 0–1, eased between `from` and `to`. */
export function levelRatio(level: number, from = 30, to = 80) {
  const t = Math.min(1, Math.max(0, (level - from) / Math.max(1, to - from)));
  return t * t * (3 - 2 * t);
}
