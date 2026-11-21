import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useStudio } from '../store';
import { toggleOrthographic, view } from '../keys';
import { viewport } from './refs';

// Navigation gizmo (View Helper), modelled on Blender's: shows the X/Y/Z directions in the current view; clicking an axis end looks along it.
// An SVG outside the Canvas, so it never appears in the render or post-processing.

const SIZE = 84;
const R = 30;
const C = SIZE / 2;
const AXES = [
  { key: 'x', dir: new THREE.Vector3(1, 0, 0), color: '#D4515C' },
  { key: 'y', dir: new THREE.Vector3(0, 1, 0), color: '#7DB24A' },
  { key: 'z', dir: new THREE.Vector3(0, 0, 1), color: '#4D86D1' },
] as const;

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

export function NavGizmo() {
  const on = useStudio((s) => s.mode === 'edit' && s.gizmos.show && s.gizmos.viewHelper);
  const orthographic = useStudio((s) => s.orthographic);
  const svg = useRef<SVGSVGElement>(null);
  const ends = useRef<(SVGGElement | null)[]>([]);
  const lines = useRef<(SVGLineElement | null)[]>([]);

  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let drawn: SVGGElement[] = [];
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cam = viewport.camera;
      const root = svg.current;
      if (!cam || !root) return;
      _q.copy(cam.quaternion).invert();
      const order: { el: SVGGElement; z: number }[] = [];
      AXES.forEach((a, i) => {
        _v.copy(a.dir).applyQuaternion(_q);
        for (const sign of [1, -1]) {
          const el = ends.current[i * 2 + (sign > 0 ? 0 : 1)];
          if (!el) continue;
          const x = C + _v.x * R * sign;
          const y = C - _v.y * R * sign;
          el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
          order.push({ el, z: _v.z * sign });
          if (sign > 0) {
            const l = lines.current[i];
            l?.setAttribute('x2', x.toFixed(1));
            l?.setAttribute('y2', y.toFixed(1));
          }
        }
      });
      // Draw the near ends last (SVG has no depth, so document order decides).
      // Reorder only when the order changes. Re-attaching elements while the button is held keeps Chrome from firing click
      order.sort((a, b) => a.z - b.z);
      if (order.length === drawn.length && order.every((o, i) => o.el === drawn[i])) return;
      for (const o of order) root.appendChild(o.el);
      drawn = order.map((o) => o.el);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  if (!on) return null;
  return (
    <div className="nav-gizmo">
      <svg ref={svg} width={SIZE} height={SIZE}>
        <circle cx={C} cy={C} r={C - 2} className="nav-back" />
        {AXES.map((a, i) => (
          <line key={a.key} ref={(el) => void (lines.current[i] = el)} x1={C} y1={C} x2={C} y2={C} stroke={a.color} strokeWidth={2} />
        ))}
        {AXES.map((a, i) =>
          [1, -1].map((sign) => (
            <g
              key={a.key + sign}
              ref={(el) => void (ends.current[i * 2 + (sign > 0 ? 0 : 1)] = el)}
              className="nav-end"
              onClick={() => view(a.dir.clone().multiplyScalar(sign).add(a.key === 'y' ? new THREE.Vector3(0, 0, 0.0001) : new THREE.Vector3()))}
            >
              <circle r={sign > 0 ? 8 : 6} fill={sign > 0 ? a.color : 'transparent'} stroke={a.color} strokeWidth={sign > 0 ? 0 : 1.5} />
              {sign > 0 && (
                <text textAnchor="middle" dy="3.5">
                  {a.key.toUpperCase()}
                </text>
              )}
            </g>
          )),
        )}
      </svg>
      <button className="nav-projection" onClick={toggleOrthographic} title="Perspective / Orthographic  5">
        {orthographic ? 'Orthographic' : 'Perspective'}
      </button>
    </div>
  );
}
