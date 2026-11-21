import { useEffect, useRef, useState } from 'react';

/** Divider between panels. Reports the dragged amount (px). Moves left/right when axis is x, up/down when it is y */
export function Splitter({ axis, onDrag }: { axis: 'x' | 'y'; onDrag: (delta: number) => void }) {
  const last = useRef<number | null>(null);
  return (
    <div
      className={'splitter ' + axis}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        last.current = axis === 'x' ? e.clientX : e.clientY;
      }}
      onPointerMove={(e) => {
        if (last.current === null) return;
        const v = axis === 'x' ? e.clientX : e.clientY;
        onDrag(v - last.current);
        last.current = v;
      }}
      onPointerUp={() => (last.current = null)}
      onLostPointerCapture={() => (last.current = null)}
    />
  );
}

export interface PanelSizes {
  /** Width of the Hierarchy and Assets column */
  mid: number;
  /** Width of the Inspector column */
  right: number;
  /** Height of the Timeline, Data and Console area */
  bottom: number;
  /** Height of the Hierarchy */
  hierarchy: number;
}

const KEY = 'three-stage:panel-sizes';
const DEFAULT: PanelSizes = { mid: 250, right: 310, bottom: 200, hierarchy: 380 };
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Panel sizes. Stored in the browser so they stay the same after reopening */
export function usePanelSizes() {
  const [sizes, setSizes] = useState<PanelSizes>(() => {
    try {
      return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch {
      return DEFAULT;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(sizes));
    } catch {}
  }, [sizes]);
  const resize = (key: keyof PanelSizes, delta: number) =>
    setSizes((s) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const next = { ...s, [key]: s[key] + delta };
      next.mid = clamp(next.mid, 160, w - next.right - 320);
      next.right = clamp(next.right, 220, w - next.mid - 320);
      next.bottom = clamp(next.bottom, 80, h - 200);
      next.hierarchy = clamp(next.hierarchy, 80, h - 160);
      return next;
    });
  return [sizes, resize] as const;
}
