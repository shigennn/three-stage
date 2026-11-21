import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fitFrame, useStageSize } from './OverlayFrame';
import { ObjectFinder } from './cameras';

// Moves 2D UI elements to the on-screen position of a named object.
// Transforms are written directly in the frame the camera moved, not through React state.

/** A point in 2D UI stage coordinates. */
export interface ScreenPoint {
  /** px from the left of the stage. */
  x: number;
  /** px from the top of the stage. */
  y: number;
  /** False when the object is behind the camera, not found, or outside the stage. */
  visible: boolean;
}

interface Attached {
  el: HTMLElement;
  x: number;
  y: number;
  shown: boolean | null;
}

/** Tracks the on-screen positions of named objects and moves the 2D UI elements attached to them. */
export class FollowStore {
  /** Latest stage position of each tracked name. */
  readonly points = new Map<string, ScreenPoint>();
  private attached = new Map<string, Set<Attached>>();

  /** Attaches an element to an object. The element's top-left corner goes to the point. Call the returned function to detach it. */
  attach(name: string, el: HTMLElement) {
    const a: Attached = { el, x: NaN, y: NaN, shown: null };
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.visibility = 'hidden';
    let set = this.attached.get(name);
    if (!set) this.attached.set(name, (set = new Set()));
    set.add(a);
    this.writeOne(name, a);
    return () => {
      set!.delete(a);
      if (!set!.size) {
        this.attached.delete(name);
        this.points.delete(name);
      }
    };
  }

  /** Returns the names that have at least one attached element. */
  names() {
    return this.attached.keys();
  }

  /** Writes only the elements whose position or visibility changed. */
  write() {
    for (const [name, set] of this.attached) for (const a of set) this.writeOne(name, a);
  }

  private writeOne(name: string, a: Attached) {
    const p = this.points.get(name);
    const show = !!p?.visible;
    if (show !== a.shown) {
      a.el.style.visibility = show ? 'visible' : 'hidden';
      a.shown = show;
    }
    if (!show) return;
    const x = Math.round(p!.x * 2) / 2;
    const y = Math.round(p!.y * 2) / 2;
    if (x === a.x && y === a.y) return;
    a.x = x;
    a.y = y;
    a.el.style.transform = `translate(${x}px, ${y}px)`;
  }
}

/** Provides the {@link FollowStore} shared by the 2D UI and {@link FollowTracker}. */
export const FollowContext = createContext<FollowStore>(new FollowStore());

/**
 * Moves a 2D UI element to the position of the object referenced by name. Pass the returned function to the element's `ref`.
 * The element's top-left corner goes to the point, so to show a label above the point, offset its content with something like `transform: translate(-50%, -100%)`.
 */
export function useFollowRef(name: string) {
  const store = useContext(FollowContext);
  const detach = useRef<(() => void) | null>(null);
  useEffect(() => () => detach.current?.(), []);
  return useCallback(
    (el: HTMLElement | null) => {
      detach.current?.();
      detach.current = el ? store.attach(name, el) : null;
    },
    [store, name],
  );
}

const _p = new THREE.Vector3();

/** Computes, every frame, the on-screen positions of the objects the 2D UI references. Place it inside the Canvas. */
export function FollowTracker() {
  const store = useContext(FollowContext);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const stage = useStageSize();
  const finder = useMemo(() => new ObjectFinder(scene), [scene]);

  useFrame((state) => {
    const camera = state.camera;
    camera.updateMatrixWorld();
    const f = fitFrame(size.width, size.height, stage);
    const now = state.clock.elapsedTime;
    for (const name of store.names()) {
      let p = store.points.get(name);
      if (!p) store.points.set(name, (p = { x: 0, y: 0, visible: false }));
      const o = finder.get(name, now);
      if (!o) {
        p.visible = false;
        continue;
      }
      o.getWorldPosition(_p).project(camera);
      const sx = ((_p.x + 1) / 2) * size.width;
      const sy = ((1 - _p.y) / 2) * size.height;
      p.x = (sx - f.left) / f.scale;
      p.y = (sy - f.top) / f.scale;
      p.visible = _p.z > -1 && _p.z < 1 && p.x >= 0 && p.x <= stage.width && p.y >= 0 && p.y <= stage.height;
    }
    store.write();
  });
  return null;
}
