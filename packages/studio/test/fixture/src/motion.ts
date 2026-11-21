import * as THREE from 'three';
import { defineCameraMotion } from '@three-stage/runtime';
import { probe } from './probe';

const _p = new THREE.Vector3();
defineCameraMotion<{ prefix: string }>({
  type: 'test.eachItem',
  label: 'Each Item',
  params: { prefix: { type: 'text', default: 'Slots ', label: 'Prefix' } },
  apply(out, ctx, p) {
    const items = ctx.findAll(p.prefix);
    probe.motion = { found: items.map((o) => o.name), t: ctx.t, length: ctx.length };
    if (!items.length) return;
    const k = Math.min(items.length - 1, Math.floor((ctx.t / ctx.length) * items.length));
    items[k].getWorldPosition(_p);
    const offset = out.position.clone().sub(out.target);
    out.target.copy(_p);
    out.position.copy(_p).add(offset);
  },
});
