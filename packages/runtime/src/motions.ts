import * as THREE from 'three';
import { defineCameraMotion } from './registry';

// Camera motions built into the runtime. Projects add others with defineCameraMotion.

type Drift = { orbit: number; tilt: number; distance: number; sway: number; heave: number; period: number };

const D2R = Math.PI / 180;
const _o = new THREE.Vector3();
const _r = new THREE.Vector3();
const _s = new THREE.Spherical();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Keeps the camera gently swaying around its set position. The azimuth and elevation around the target, the distance to the target,
 * and sideways and vertical offsets each oscillate on sine waves with different periods.
 * The pose depends on time alone, so it never drifts away however long it runs. Driven by `time`, it carries on across shots.
 */
defineCameraMotion<Drift>({
  type: 'stage.drift',
  label: 'Drift',
  params: {
    orbit: { type: 'number', default: 6, min: 0, max: 90, step: 0.1, unit: '°', label: 'Orbit' },
    tilt: { type: 'number', default: 0.6, min: 0, max: 30, step: 0.05, unit: '°', label: 'Tilt' },
    distance: { type: 'number', default: 5, min: 0, max: 50, step: 0.5, unit: '%', label: 'Distance' },
    sway: { type: 'number', default: 0, min: 0, step: 0.01, unit: 'm', label: 'Sway' },
    heave: { type: 'number', default: 0, min: 0, step: 0.01, unit: 'm', label: 'Heave' },
    period: { type: 'number', default: 30, min: 1, step: 0.5, unit: 's', label: 'Period' },
  },
  apply(out, { time }, p) {
    const w = (2 * Math.PI) / Math.max(1, p.period);
    // The period ratios are chosen not to divide evenly, so the overall motion does not visibly repeat.
    const wave = (k: number, phase: number) => Math.sin(w * k * time + phase);
    _s.setFromVector3(_o.subVectors(out.position, out.target));
    _s.theta += p.orbit * D2R * wave(1, 0);
    _s.phi -= p.tilt * D2R * wave(0.73, 1.3);
    _s.radius *= 1 + (p.distance / 100) * wave(0.61, 2.1);
    _s.makeSafe();
    out.position.setFromSpherical(_s).add(out.target);
    if (p.sway || p.heave) {
      _r.subVectors(out.target, out.position).cross(UP).normalize();
      _o.copy(_r).multiplyScalar(p.sway * wave(0.87, 0.4)).addScaledVector(UP, p.heave * wave(1.17, 2.7));
      out.position.add(_o);
      out.target.add(_o);
    }
  },
});
