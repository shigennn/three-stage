import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { ItemRef } from '@three-stage/runtime';
import { beginGesture, editLive, endGesture, keyOf, parseKey, select, useHandleVersion, useStudio, type GizmoMode, type ItemKey } from '../store';
import { itemObject, isTransformable, transformFromObject, writeTransform } from '../items';
import { spriteScale } from './EditorCamera';
import { modal } from './modal';

const SELECT_COLOR = '#3CC6DD';
const AXIS_COLOR = { x: '#D4515C', y: '#7DB24A', z: '#4D86D1' };

/** Click to select an object. Objects with selection disabled are skipped. Shift+click adds to the selection */
export function Selectable({ children }: { children: ReactNode }) {
  const mode = useStudio((s) => s.mode);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (mode !== 'edit' || e.nativeEvent.altKey || e.nativeEvent.button !== 0 || modal.active) return;
    // R3F also reports the release after a drag as a click. Don't reselect right after moving the gizmo or confirming G/R/S with a click
    if (e.delta > 4 || performance.now() - modal.endedAt < 300) return;
    let o: THREE.Object3D | null = e.object;
    let child: THREE.Object3D | null = null;
    while (o && !o.userData.stageItem) {
      child = o;
      o = o.parent;
    }
    if (!o) return;
    e.stopPropagation();
    const st = useStudio.getState();
    const eye = st.eyedropper;
    const ref = o.userData.stageItem as ItemRef;
    const key = keyOf(ref);
    if (eye) {
      // If an object a component laid out (one item in its slots) has a name, use that name
      const name = ref.kind === 'object' ? ref.name : ref.kind === 'component' && child?.name ? child.name : o.name;
      useStudio.setState({ eyedropper: null });
      eye(name);
      return;
    }
    if (st.locked.has(key)) return;
    select([key], e.nativeEvent.shiftKey);
  };
  return <group onClick={onClick}>{children}</group>;
}

function SelectionBox({ obj }: { obj: THREE.Object3D }) {
  const helper = useMemo(() => {
    const h = new THREE.BoxHelper(obj, SELECT_COLOR);
    (h.material as THREE.LineBasicMaterial).depthTest = false;
    (h.material as THREE.LineBasicMaterial).transparent = true;
    (h.material as THREE.LineBasicMaterial).opacity = 0.9;
    h.renderOrder = 999;
    return h;
  }, [obj]);
  useEffect(() => () => helper.dispose(), [helper]);
  useFrame(() => helper.update());
  return <primitive object={helper} />;
}

export function SelectionBoxes() {
  const selection = useStudio((s) => s.selection);
  const mode = useStudio((s) => s.mode);
  useHandleVersion();
  if (mode !== 'edit') return null;
  return (
    <>
      {selection.map((k) => {
        const o = itemObject(k);
        return o ? <SelectionBox key={k} obj={o} /> : null;
      })}
    </>
  );
}

/** The gizmo. Attaches to the first selected object. Snaps to the grid while Ctrl is held */
export function Gizmo() {
  const selection = useStudio((s) => s.selection);
  const mode = useStudio((s) => s.mode);
  const gizmo = useStudio((s) => s.gizmo);
  const enabled = useStudio((s) => s.gizmos.show && s.gizmos.transformControls);
  const locked = useStudio((s) => s.locked);
  const [snap, setSnap] = useState(false);
  const [modalOn, setModalOn] = useState(false);
  useHandleVersion();
  const dragging = useRef(false);

  useEffect(() => {
    const k = (e: KeyboardEvent) => setSnap(e.ctrlKey);
    window.addEventListener('keydown', k);
    window.addEventListener('keyup', k);
    const off = modal.subscribe(() => setModalOn(modal.active));
    return () => {
      window.removeEventListener('keydown', k);
      window.removeEventListener('keyup', k);
      off();
    };
  }, []);

  const key: ItemKey | undefined = selection.find(isTransformable);
  const kind = key ? parseKey(key).kind : '';
  const obj = key ? itemObject(key) : undefined;
  const showing = enabled && mode === 'edit' && !!key && !!obj && !locked.has(key) && !modalOn;

  // If the gizmo disappears mid-drag (selection change, entering Play), onMouseUp never fires, so close the undo entry here
  useEffect(() => {
    if (dragging.current) {
      dragging.current = false;
      endGesture();
    }
  }, [showing, obj]);

  if (!showing || !key || !obj) return null;
  const positionOnly = kind === 'light' || kind === 'empty';

  return (
    <TransformGizmo
      object={obj}
      mode={positionOnly ? 'translate' : gizmo}
      snap={snap}
      onMouseDown={() => {
        dragging.current = true;
        beginGesture();
      }}
      onObjectChange={() => {
        if (!dragging.current) return;
        const t = transformFromObject(obj);
        editLive((d) => writeTransform(d, key, positionOnly ? { position: t.position } : t));
      }}
      onMouseUp={() => {
        dragging.current = false;
        endGesture();
      }}
    />
  );
}

type GizmoEvents = { onMouseDown: () => void; onObjectChange: () => void; onMouseUp: () => void };

/** Uses three.js TransformControls directly. drei's version wraps an older three-stdlib whose axes can flip toward the camera, pointing opposite to the View Helper */
function TransformGizmo({ object, mode, snap, ...events }: { object: THREE.Object3D; mode: GizmoMode; snap: boolean } & GizmoEvents) {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const connected = useThree((s) => s.events.connected) as HTMLElement | undefined;
  const orbit = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const el = connected ?? gl.domElement;
  const tc = useMemo(() => {
    const c = new TransformControls(camera);
    c.setColors(AXIS_COLOR.x, AXIS_COLOR.y, AXIS_COLOR.z, '#FFFF00');
    c.setSize(0.8);
    return c;
  }, []);
  const handlers = useRef<GizmoEvents>(events);
  handlers.current = events;

  useEffect(() => {
    const helper = tc.getHelper();
    scene.add(helper);
    tc.connect(el);
    const down = () => handlers.current.onMouseDown();
    const change = () => handlers.current.onObjectChange();
    const up = () => handlers.current.onMouseUp();
    tc.addEventListener('mouseDown', down);
    tc.addEventListener('objectChange', change);
    tc.addEventListener('mouseUp', up);
    return () => {
      tc.removeEventListener('mouseDown', down);
      tc.removeEventListener('objectChange', change);
      tc.removeEventListener('mouseUp', up);
      tc.disconnect();
      scene.remove(helper);
    };
  }, [tc, scene, el]);
  useEffect(() => () => tc.getHelper().dispose(), [tc]);

  // Disable view navigation while dragging the gizmo
  useEffect(() => {
    if (!orbit) return;
    const f = (e: { value: unknown }) => void (orbit.enabled = !e.value);
    tc.addEventListener('dragging-changed', f);
    return () => tc.removeEventListener('dragging-changed', f);
  }, [tc, orbit]);

  useLayoutEffect(() => {
    tc.camera = camera;
  }, [tc, camera]);
  useLayoutEffect(() => {
    tc.attach(object);
    return () => void tc.detach();
  }, [tc, object]);
  useLayoutEffect(() => {
    tc.setMode(mode);
    tc.setTranslationSnap(snap ? 0.1 : null);
    tc.setRotationSnap(snap ? THREE.MathUtils.degToRad(5) : null);
    tc.setScaleSnap(snap ? 0.1 : null);
  }, [tc, mode, snap]);
  return null;
}

// Light icons: 2D images of the light type, drawn at a constant screen size
const ICON_PX = 64;
const ICON_SCALE = 0.03;
const iconTextures = new Map<string, THREE.Texture>();

function drawIcon(type: string) {
  const c = document.createElement('canvas');
  c.width = c.height = ICON_PX;
  const g = c.getContext('2d')!;
  const m = ICON_PX / 2;
  g.strokeStyle = '#FFFFFF';
  g.fillStyle = '#FFFFFF';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.shadowColor = 'rgba(0,0,0,0.85)';
  g.shadowBlur = 4;
  if (type === 'directional') {
    g.beginPath();
    g.arc(m, m, 10, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(m + Math.cos(a) * 16, m + Math.sin(a) * 16);
      g.lineTo(m + Math.cos(a) * 26, m + Math.sin(a) * 26);
      g.stroke();
    }
  } else if (type === 'spot') {
    g.beginPath();
    g.moveTo(m, 8);
    g.lineTo(m - 20, 50);
    g.quadraticCurveTo(m, 60, m + 20, 50);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.arc(m, 10, 6, 0, Math.PI * 2);
    g.fill();
  } else if (type === 'hemisphere') {
    g.beginPath();
    g.arc(m, m + 4, 22, Math.PI, 0);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(m, m + 4, 22, 0, Math.PI);
    g.stroke();
  } else {
    g.beginPath();
    g.arc(m, m - 6, 16, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(m, m - 6, 7, 0, Math.PI * 2);
    g.fill();
    g.fillRect(m - 8, m + 14, 16, 4);
    g.fillRect(m - 6, m + 21, 12, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function iconTexture(type: string) {
  let t = iconTextures.get(type);
  if (!t) iconTextures.set(type, (t = drawIcon(type)));
  return t;
}

function LightIcon({ id, color, type, position, target }: { id: string; color: string; type: string; position: [number, number, number]; target: [number, number, number] }) {
  const sprite = useMemo(() => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(type), depthTest: false, transparent: true, sizeAttenuation: false }));
    s.renderOrder = 998;
    s.userData = { stageItem: { kind: 'light', id } };
    return s;
  }, [type, id]);
  useEffect(() => () => sprite.material.dispose(), [sprite]);
  useFrame(({ camera }) => {
    const k = ICON_SCALE * spriteScale(camera);
    sprite.scale.set(k, k, 1);
  });
  useEffect(() => {
    sprite.position.set(...position);
    sprite.material.color.set(color);
  }, [sprite, position[0], position[1], position[2], color]);
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...position), new THREE.Vector3(...target)]);
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: '#9AA3AF', dashSize: 0.6, gapSize: 0.4, depthTest: false, transparent: true, opacity: 0.7 }));
    l.raycast = () => {};
    return l;
  }, [position[0], position[1], position[2], target[0], target[1], target[2]]);
  useEffect(() => {
    line.computeLineDistances();
    return () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    };
  }, [line]);
  const directed = type === 'directional' || type === 'spot';
  return (
    <>
      <primitive object={sprite} />
      {directed && <primitive object={line} />}
    </>
  );
}

/** Light icons and Empty markers. Shown only in Edit */
export function Helpers() {
  const scene = useStudio((s) => s.scene);
  const mode = useStudio((s) => s.mode);
  const gizmos = useStudio((s) => s.gizmos);
  const hidden = useStudio((s) => s.hidden);
  const handle = useStudio((s) => s.handle);
  useHandleVersion();
  if (!scene || mode !== 'edit' || !gizmos.show) return null;
  return (
    <>
      {gizmos.lightHelpers &&
        scene.lights
          .filter((l) => !hidden.has('light:' + l.id))
          .map((l) => <LightIcon key={l.id} id={l.id} color={l.color} type={l.type} position={l.position} target={l.target} />)}
      {gizmos.empties &&
        scene.empties
          .filter((e) => !hidden.has('empty:' + e.id))
          .map((e) => {
            const obj = handle.empties.get(e.id);
            return obj ? <EmptyMark key={e.id} obj={obj} /> : null;
          })}
    </>
  );
}

/** X, Y and Z axis lines through the origin (the Axes overlay) */
export function Axes() {
  const overlays = useStudio((s) => s.overlays);
  const mode = useStudio((s) => s.mode);
  const lines = useMemo(() => {
    const make = (dir: THREE.Vector3, color: string) => {
      const g = new THREE.BufferGeometry().setFromPoints([dir.clone().multiplyScalar(-200), dir.clone().multiplyScalar(200)]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
      l.position.y = 0.002;
      l.raycast = () => {};
      return l;
    };
    return { x: make(new THREE.Vector3(1, 0, 0), AXIS_COLOR.x), y: make(new THREE.Vector3(0, 1, 0), AXIS_COLOR.y), z: make(new THREE.Vector3(0, 0, 1), AXIS_COLOR.z) };
  }, []);
  if (mode !== 'edit') return null;
  return (
    <>
      {overlays.axisX && <primitive object={lines.x} />}
      {overlays.axisY && <primitive object={lines.y} />}
      {overlays.axisZ && <primitive object={lines.z} />}
    </>
  );
}

/** Empty marker. It is a child of the Empty's Object3D placed by the runtime, so clicking it selects that Empty.
 * editorOnly marks it to be excluded from reflection probes */
function EmptyMark({ obj }: { obj: THREE.Object3D }) {
  return createPortal(
    <mesh renderOrder={998} userData={{ editorOnly: true }}>
      <sphereGeometry args={[0.25, 10, 8]} />
      <meshBasicMaterial color="#E5E7EB" wireframe depthTest={false} transparent />
    </mesh>,
    obj,
  );
}

export function Grid() {
  const on = useStudio((s) => s.overlays.grid && s.mode === 'edit');
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(200, 40, '#8A8F97', '#6A6E75');
    g.position.y = 0.001;
    g.raycast = () => {};
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true;
    m.opacity = 0.35;
    m.depthWrite = false;
    return g;
  }, []);
  return on ? <primitive object={grid} /> : null;
}

export function Wireframe() {
  const on = useStudio((s) => s.overlays.wireframe && s.mode === 'edit');
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#A0A6AE', wireframe: true }), []);
  useFrame(({ scene }) => {
    scene.overrideMaterial = on ? mat : null;
  });
  return null;
}
