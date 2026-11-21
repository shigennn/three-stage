import { useEffect, useRef, useState } from 'react';
import { useStageData } from './data';
import { registry } from './registry';
import { useRegistry } from './useRegistry';
import { useStageEnv } from './context';
import { stageSize } from './schema';

/** Returns the position and scale that fit the output frame (the 2D UI stage) inside a parent of the given size. */
export function fitFrame(width: number, height: number, stage: { width: number; height: number }) {
  const s = Math.min(width / stage.width, height / stage.height);
  return { scale: s, left: (width - stage.width * s) / 2, top: (height - stage.height * s) / 2, width: stage.width * s, height: stage.height * s };
}

/** Returns the size of the 2D UI stage for the open scene (set by render.aspectRatio). */
export function useStageSize() {
  const [w, h] = useStageEnv().render.aspectRatio;
  return stageSize([w, h]);
}

/** Returns a ref to attach to an element and the element's current client size, updated on resize. */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/**
 * Overlays the 2D UI the project registered as a stage, scaled down to fit the frame.
 * The stage element has `id="stage"`, which `three-stage shot` uses to find the 2D UI.
 */
export function OverlayFrame({ visible = true }: { visible?: boolean }) {
  useRegistry();
  const data = useStageData();
  const stage = useStageSize();
  const [ref, size] = useElementSize<HTMLDivElement>();
  const ov = registry.overlay();
  const f = fitFrame(size.width, size.height, stage);
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {ov && visible && size.width > 0 && (
        <div
          id="stage"
          style={{
            position: 'absolute',
            left: f.left,
            top: f.top,
            width: stage.width,
            height: stage.height,
            transform: `scale(${f.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <ov.Component data={data} />
        </div>
      )}
    </div>
  );
}
