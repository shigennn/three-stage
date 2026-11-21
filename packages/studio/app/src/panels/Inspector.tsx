import { useEffect, useState } from 'react';
import type { Draft } from 'immer';
import {
  defaultParams,
  defaultShadow,
  eventTimelineLength,
  MATERIAL_MAPS,
  materialDefFrom,
  registry,
  useRegistry,
  type ComponentInstanceDef,
  type EasingName,
  type LightDef,
  type StageSceneDef,
  type Vec3,
} from '@three-stage/runtime';
import { edit, log, newId, parseKey, select, useHandleVersion, useStudio, type ItemKey } from '../store';
import * as THREE from 'three';
import { clipsOf, findTrack, parentBase, parseClipKey, readTransform, writeTransform } from '../items';
import { dataStore } from '../mock';
import { events } from '../viewport/Viewport';
import { AssetSlot, CheckField, ColorField, NumberField, Row, Section, SelectField, TextField, Vec3Field, sceneSetter, type OnChange } from '../ui/fields';
import { MaterialInspector } from './MaterialInspector';
import { EnvironmentInspector } from './EnvironmentInspector';
import { LIGHT_CLASS } from './Hierarchy';
import { alignCameraToView, viewFromCamera } from '../keys';
import { targetLabel } from './Timeline';
import { DataPathField, ParamField, PickField } from './ParamFields';

function TransformSection({ k, scene, reset }: { k: ItemKey; scene: StageSceneDef; reset?: () => void }) {
  const t = readTransform(k, scene);
  if (!t) return null;
  const kind = parseKey(k).kind;
  const positionOnly = kind === 'light' || kind === 'empty';
  const set = (field: 'position' | 'rotation' | 'scale') => sceneSetter<Vec3>((d, v) => writeTransform(d, k, { [field]: v }), `${k}:${field}`);
  return (
    <Section
      title="Transform"
      actions={
        reset && (
          <button className="small-btn" onClick={reset} title="Reset to the position in the glb">
            Reset
          </button>
        )
      }
    >
      <Vec3Field label="Position" value={t.position} onChange={set('position')} step={0.01} precision={3} />
      {!positionOnly && <Vec3Field label="Rotation" value={t.rotation} onChange={set('rotation')} step={0.5} precision={2} />}
      {!positionOnly && <Vec3Field label="Scale" value={t.scale} onChange={set('scale')} step={0.005} precision={3} />}
    </Section>
  );
}

function MaterialSlots({ objectName, scene }: { objectName: string; scene: StageSceneDef }) {
  useHandleVersion();
  const handle = useStudio((s) => s.handle);
  const slots = handle.originals.get(objectName);
  if (!slots || slots.size === 0) return null;
  const mats = Object.entries(scene.materials);
  const assigned = (slot: string) => scene.materialAssignments.find((a) => a.object === objectName && a.slot === slot)?.material ?? '';
  const assign = (slot: string, material: string) =>
    edit((d) => {
      d.materialAssignments = d.materialAssignments.filter((a) => !(a.object === objectName && a.slot === slot));
      if (material) d.materialAssignments.push({ object: objectName, slot, material });
    });
  const copyOriginal = (slot: string) => {
    const src = slots.get(slot);
    if (!src) return;
    const id = newId('mat');
    const def = materialDefFrom(src, slot);
    edit((d) => {
      d.materials[id] = def;
      d.materialAssignments = d.materialAssignments.filter((a) => !(a.object === objectName && a.slot === slot));
      d.materialAssignments.push({ object: objectName, slot, material: id });
    });
    select(['material:' + id]);
    const lost = MATERIAL_MAPS.filter((m) => (src as any)[m]);
    if (lost.length) log('warn', `${slot}: textures embedded in the glb are not copied: ${lost.join(', ')}. Put them in content/textures/ and assign them again`);
  };
  return (
    <Section title="Material">
      {[...slots.keys()].map((slot) => (
        <Row key={slot} label={slot}>
          <div className="slot-row">
            <select value={assigned(slot)} onChange={(e) => assign(slot, e.target.value)}>
              <option value="">Original</option>
              {mats.map(([id, m]) => (
                <option key={id} value={id}>
                  {m.name}
                </option>
              ))}
            </select>
            {assigned(slot) ? (
              <button className="small-btn" onClick={() => select(['material:' + assigned(slot)])}>
                Select
              </button>
            ) : (
              <button className="small-btn" onClick={() => copyOriginal(slot)} title="Copy the glb material into an editable material">
                Duplicate
              </button>
            )}
          </div>
        </Row>
      ))}
    </Section>
  );
}

function ObjectInspector({ name, scene }: { name: string; scene: StageSceneDef }) {
  useHandleVersion();
  const handle = useStudio((s) => s.handle);
  const o = scene.overrides[name];
  const asset = [...handle.assets.values()].find((a) => a.objects.some((x) => x.name === name));
  const info = asset?.objects.find((x) => x.name === name);
  const setOv = (f: (ov: NonNullable<Draft<StageSceneDef>['overrides'][string]>) => void) =>
    edit((d) => {
      d.overrides[name] = d.overrides[name] ?? {};
      f(d.overrides[name]);
      if (Object.keys(d.overrides[name]).length === 0) delete d.overrides[name];
    });
  return (
    <>
      <div className="insp-title">
        {name}
        <span className="dim small">  {asset?.path}  {info ? `${info.triangles.toLocaleString()} tris` : ''}</span>
      </div>
      <TransformSection
        k={'object:' + name}
        scene={scene}
        reset={() =>
          setOv((ov) => {
            delete ov.position;
            delete ov.rotation;
            delete ov.scale;
          })
        }
      />
      <MaterialSlots objectName={name} scene={scene} />
      <Section title="Rendering">
        <CheckField label="Visible" value={o?.visible !== false} onChange={(v) => setOv((ov) => void (v ? delete ov.visible : (ov.visible = false)))} />
        <CheckField label="Cast Shadow" value={o?.castShadow ?? true} onChange={(v) => setOv((ov) => void (v ? delete ov.castShadow : (ov.castShadow = false)))} />
        <CheckField label="Receive Shadow" value={o?.receiveShadow ?? true} onChange={(v) => setOv((ov) => void (v ? delete ov.receiveShadow : (ov.receiveShadow = false)))} />
      </Section>
      {asset && asset.clips.length > 0 && (
        <Section title="Animation">
          <SelectField
            label="Clip"
            value={o?.clip ?? ''}
            options={[{ value: '', label: 'None' }, ...asset.clips.map((c) => ({ value: c, label: c }))]}
            onChange={(v) => setOv((ov) => void (v ? (ov.clip = v) : delete ov.clip))}
          />
          <CheckField label="Loop" value={o?.loop !== false} onChange={(v) => setOv((ov) => void (v ? delete ov.loop : (ov.loop = false)))} />
        </Section>
      )}
    </>
  );
}

function PlacedInspector({ id, scene }: { id: string; scene: StageSceneDef }) {
  useHandleVersion();
  const p = scene.placed.find((x) => x.id === id);
  if (!p) return null;
  const clips = clipsOf('placed:' + id);
  const set = (f: (x: Draft<StageSceneDef>['placed'][number]) => void) =>
    edit((d) => {
      const x = d.placed.find((y) => y.id === id);
      if (x) f(x);
    });
  return (
    <>
      <div className="insp-title">
        {p.name}
        <span className="dim small">  {p.asset}</span>
      </div>
      <TransformSection k={'placed:' + id} scene={scene} />
      <Section title="Model">
        <AssetSlot label="File" value={p.asset} accept={['.glb']} onChange={(v) => v && set((x) => void (x.asset = v))} />
      </Section>
      <MaterialSlots objectName={p.name} scene={scene} />
      <Section title="Rendering">
        <CheckField label="Cast Shadow" value={p.castShadow ?? true} onChange={(v) => set((x) => void (x.castShadow = v))} />
        <CheckField label="Receive Shadow" value={p.receiveShadow ?? true} onChange={(v) => set((x) => void (x.receiveShadow = v))} />
      </Section>
      {(clips.length > 0 || p.clip) && (
        <Section title="Animation">
          <SelectField
            label="Clip"
            value={p.clip ?? ''}
            options={[{ value: '', label: 'None' }, ...clips.map((c) => ({ value: c.name, label: c.name }))]}
            onChange={(v) => set((x) => void (v ? (x.clip = v) : delete x.clip))}
          />
          <CheckField label="Loop" value={p.loop !== false} onChange={(v) => set((x) => void (v ? delete x.loop : (x.loop = false)))} />
        </Section>
      )}
    </>
  );
}

/** The three.js target. Points at the object's position if an object is set, otherwise at the Target Position point */
function TargetFields(props: { target: Vec3; targetObject?: string; set: (f: (x: { target: Vec3; targetObject?: string }) => void) => void; setTarget: OnChange<Vec3> }) {
  return (
    <>
      <PickField label="Target" value={props.targetObject ?? ''} onChange={(v) => props.set((x) => void (v ? (x.targetObject = v) : delete x.targetObject))} />
      {!props.targetObject && <Vec3Field label="Target Position" value={props.target} onChange={props.setTarget} step={0.05} />}
    </>
  );
}

function LightInspector({ id, scene }: { id: string; scene: StageSceneDef }) {
  const l = scene.lights.find((x) => x.id === id);
  if (!l) return null;
  const find = (d: Draft<StageSceneDef>) => d.lights.find((x) => x.id === id)!;
  const num = (field: keyof LightDef) => sceneSetter<number>((d, v) => void ((find(d) as any)[field] = v), `${id}:${String(field)}`);
  const sh = l.shadow ?? defaultShadow();
  const shadow = (field: keyof typeof sh) =>
    sceneSetter<number>((d, v) => {
      const x = find(d);
      x.shadow = x.shadow ?? defaultShadow();
      (x.shadow as any)[field] = v;
    }, `${id}:shadow:${field}`);
  const hasShadow = l.type === 'directional' || l.type === 'spot' || l.type === 'point';
  const directed = l.type === 'directional' || l.type === 'spot';
  return (
    <>
      <div className="insp-title">
        {l.name}
        <span className="dim small">  {LIGHT_CLASS[l.type]}</span>
      </div>
      <Section title="Light">
        <ColorField label="Color" value={l.color} onChange={sceneSetter((d, v) => void (find(d).color = v), `${id}:color`)} />
        <NumberField label="Intensity" value={l.intensity} onChange={num('intensity')} step={0.01} min={0} precision={3} />
        {l.type === 'hemisphere' && <ColorField label="Ground Color" value={l.groundColor ?? '#808080'} onChange={sceneSetter((d, v) => void (find(d).groundColor = v))} />}
        {(l.type === 'point' || l.type === 'spot') && (
          <>
            <NumberField label="Distance" value={l.distance ?? 0} onChange={num('distance')} step={0.1} min={0} unit="m" />
            <NumberField label="Decay" value={l.decay ?? 2} onChange={num('decay')} step={0.01} min={0} />
          </>
        )}
        {l.type === 'spot' && (
          <>
            <NumberField label="Angle" value={l.angle ?? 30} onChange={num('angle')} step={0.2} min={1} max={89} unit="°" />
            <NumberField label="Penumbra" value={l.penumbra ?? 0.2} onChange={num('penumbra')} step={0.005} min={0} max={1} />
          </>
        )}
        {directed && (
          <TargetFields
            target={l.target}
            targetObject={l.targetObject}
            set={(f) => edit((d) => f(find(d)))}
            setTarget={sceneSetter<Vec3>((d, v) => void (find(d).target = v), `${id}:target`)}
          />
        )}
      </Section>
      <TransformSection k={'light:' + id} scene={scene} />
      {hasShadow && (
        <Section title="Shadow">
          <CheckField label="Cast Shadow" value={l.castShadow} onChange={(v) => edit((d) => void (find(d).castShadow = v))} />
          {l.castShadow && (
            <>
              <SelectField
                label="Map Size"
                value={String(sh.mapSize)}
                options={[512, 1024, 2048, 4096].map((n) => ({ value: String(n), label: `${n} × ${n}` }))}
                onChange={(v) =>
                  edit((d) => {
                    const x = find(d);
                    x.shadow = { ...(x.shadow ?? defaultShadow()), mapSize: Number(v) };
                  })
                }
              />
              <NumberField label="Radius" value={sh.radius} onChange={shadow('radius')} step={0.05} min={0} />
              <NumberField label="Bias" value={sh.bias} onChange={shadow('bias')} step={0.00001} precision={5} />
              <NumberField label="Normal Bias" value={sh.normalBias} onChange={shadow('normalBias')} step={0.001} precision={3} />
              {l.type === 'directional' && <NumberField label="Camera Size" value={sh.cameraSize} onChange={shadow('cameraSize')} step={0.2} min={1} unit="m" />}
            </>
          )}
        </Section>
      )}
    </>
  );
}

function ComponentInspector({ id, scene }: { id: string; scene: StageSceneDef }) {
  useRegistry();
  const c = scene.components.find((x) => x.id === id);
  if (!c) return null;
  const def = registry.component(c.type);
  const params = defaultParams(def, c.params);
  const find = (d: Draft<StageSceneDef>) => d.components.find((x) => x.id === id)! as Draft<ComponentInstanceDef>;
  return (
    <>
      <div className="insp-title">
        {c.name}
        <span className="dim small">  {c.type}</span>
      </div>
      {!def && <div className="warn-box">{c.type} is not registered</div>}
      <Section title={def?.label ?? c.type}>
        <CheckField label="Enabled" value={c.enabled} onChange={(v) => edit((d) => void (find(d).enabled = v))} />
        {def &&
          Object.entries(def.params).map(([k, p]) => (
            <ParamField key={k} name={k} def={p} value={params[k]} onChange={sceneSetter((d, v) => void (find(d).params[k] = v), `${id}:p:${k}`)} />
          ))}
      </Section>
      {def?.binding && Object.keys(def.binding).length > 0 && (
        <Section title="Binding">
          {Object.entries(def.binding).map(([k, kind]) =>
            kind === 'data' ? (
              <DataPathField key={k} label={k} value={c.binding[k] ?? ''} onChange={(v) => edit((d) => void (find(d).binding[k] = v), { coalesce: `${id}:b:${k}` })} />
            ) : (
              <PickField key={k} label={k} value={c.binding[k] ?? ''} onChange={(v) => edit((d) => void (find(d).binding[k] = v))} />
            ),
          )}
        </Section>
      )}
      <TransformSection k={'component:' + id} scene={scene} />
    </>
  );
}

function EmptyInspector({ id, scene }: { id: string; scene: StageSceneDef }) {
  const e = scene.empties.find((x) => x.id === id);
  if (!e) return null;
  const find = (d: Draft<StageSceneDef>) => d.empties.find((x) => x.id === id)!;
  // When the Parent changes, recompute the offset so the Empty stays where it is
  const setParent = (v: string) => {
    const world = parentBase(e.parent).add(new THREE.Vector3(...e.position));
    const off = world.sub(parentBase(v || undefined));
    edit((d) => {
      const x = find(d);
      if (v) x.parent = v;
      else delete x.parent;
      x.position = [off.x, off.y, off.z].map((n) => Math.round(n * 10000) / 10000) as Vec3;
    });
  };
  return (
    <>
      <div className="insp-title">{e.name}</div>
      {e.parent ? (
        <Section title="Transform">
          <Vec3Field label="Offset" value={e.position} onChange={sceneSetter<Vec3>((d, v) => void (find(d).position = v), `${id}:offset`)} step={0.01} precision={3} />
        </Section>
      ) : (
        <TransformSection k={'empty:' + id} scene={scene} />
      )}
      <Section title="Empty">
        <PickField label="Parent" value={e.parent ?? ''} onChange={setParent} />
      </Section>
    </>
  );
}

const EASINGS: { value: EasingName; label: string }[] = [
  { value: 'easeInOut', label: 'Ease In Out' },
  { value: 'easeOut', label: 'Ease Out' },
  { value: 'easeIn', label: 'Ease In' },
  { value: 'linear', label: 'Linear' },
];

function CameraInspector({ id, scene }: { id: string; scene: StageSceneDef }) {
  useRegistry();
  const c = scene.cameras.find((x) => x.id === id);
  if (!c) return null;
  const motion = c.motion ? registry.cameraMotion(c.motion.type) : undefined;
  const motionParams = motion && c.motion ? defaultParams(motion, c.motion.params) : {};
  const motionTypes = [{ value: 'none', label: 'None' }, ...registry.cameraMotions().map((m) => ({ value: m.type, label: m.label ?? m.type }))];
  const find = (d: Draft<StageSceneDef>) => d.cameras.find((x) => x.id === id)!;
  const num = (field: 'fov' | 'duration' | 'blend') => sceneSetter<number>((d, v) => void (find(d)[field] = v), `${id}:${field}`);
  return (
    <>
      <div className="insp-title">{c.name}</div>
      <Section
        title="Camera"
        actions={
          <>
            <button className="small-btn" onClick={() => viewFromCamera(id)} title="View from this camera  0">
              Look Through
            </button>
            <button className="small-btn" onClick={() => alignCameraToView(id)} title="Move this camera to the current Viewport view  Ctrl+Alt+0">
              Align With View
            </button>
          </>
        }
      >
        <Vec3Field label="Position" value={c.position} onChange={sceneSetter<Vec3>((d, v) => void (find(d).position = v), `${id}:pos`)} step={0.05} />
        <TargetFields
          target={c.target}
          targetObject={c.targetObject}
          set={(f) => edit((d) => f(find(d)))}
          setTarget={sceneSetter<Vec3>((d, v) => void (find(d).target = v), `${id}:tgt`)}
        />
        <NumberField label="FOV" value={c.fov} onChange={num('fov')} step={0.1} min={1} max={120} unit="°" />
      </Section>
      <Section title="Timeline">
        <NumberField label="Duration" value={c.duration} onChange={num('duration')} step={0.05} min={0.5} unit="s" />
        <NumberField label="Blend" value={c.blend} onChange={num('blend')} step={0.02} min={0} unit="s" />
        <SelectField<EasingName> label="Easing" value={c.easing} options={EASINGS} onChange={(v) => edit((d) => void (find(d).easing = v))} />
      </Section>
      <Section title="Motion">
        <SelectField
          label="Type"
          value={c.motion?.type ?? 'none'}
          options={motionTypes}
          onChange={(v) =>
            edit((d) => {
              if (v === 'none') delete find(d).motion;
              else find(d).motion = { type: v, params: {} };
            })
          }
        />
        {c.motion && !motion && <div className="warn-box">Motion {c.motion.type} is not registered</div>}
        {motion &&
          Object.entries(motion.params).map(([k, p]) => (
            <ParamField key={k} name={k} def={p} value={motionParams[k]} onChange={sceneSetter((d, v) => void (find(d).motion!.params[k] = v), `${id}:m:${k}`)} />
          ))}
      </Section>
    </>
  );
}

/** A Clip on an Activation Track or Animation Track, on either the Play Timeline or an Event Timeline */
function ClipInspector({ k, scene }: { k: ItemKey; scene: StageSceneDef }) {
  useHandleVersion();
  const { trackId, clipId } = parseClipKey(k);
  const f = findTrack(scene, trackId);
  const c = (f?.track.clips as { id: string; start: number; end: number }[] | undefined)?.find((x) => x.id === clipId);
  if (!f || !c) return null;
  type AnyClip = { start: number; end: number; fadeIn?: number; fadeOut?: number; clip?: string };
  const find = (d: Draft<StageSceneDef>) => (findTrack(d, trackId)!.track.clips as AnyClip[]).find((x) => (x as { id?: string }).id === clipId)!;
  const num = (field: 'start' | 'end' | 'fadeIn' | 'fadeOut') =>
    sceneSetter<number>((d, v) => {
      const x = find(d);
      x[field] = v;
      if (field === 'start' && x.end < x.start + 0.1) x.end = x.start + 0.1;
      if (field === 'end' && x.start > x.end - 0.1) x.start = Math.max(0, x.end - 0.1);
    }, `${k}:${field}`);
  const ui = f.track.target.startsWith('ui:');
  const clips = f.kind === 'animation' ? clipsOf(f.track.target) : [];
  const anim = f.kind === 'animation' ? (c as AnyClip) : null;
  // When another Clip is chosen, set the range to that Clip's length
  const setClip = (name: string) =>
    edit((d) => {
      const x = find(d);
      x.clip = name;
      const len = clips.find((cl) => cl.name === name)?.duration;
      if (len) x.end = x.start + len;
    });
  return (
    <>
      <div className="insp-title">
        {targetLabel(f.track.target, scene)}
        <span className="dim small">  {f.kind === 'animation' ? 'Animation Track' : 'Activation Track'}</span>
      </div>
      <Section title="Clip">
        {anim && (
          <SelectField
            label="Clip"
            value={anim.clip ?? ''}
            options={[{ value: '', label: 'None' }, ...clips.map((cl) => ({ value: cl.name, label: `${cl.name}  ${+cl.duration.toFixed(2)} s` }))]}
            onChange={setClip}
          />
        )}
        {anim && !clips.length && <div className="warn-box">This object's glb has no animation Clips. Add an animation in your modeling tool and export it to the glb</div>}
        <NumberField label="Start" value={c.start} onChange={num('start')} step={0.05} min={0} unit="s" />
        <NumberField label="End" value={c.end} onChange={num('end')} step={0.05} min={0.1} unit="s" />
        {!anim && <NumberField label="Fade In" value={(c as AnyClip).fadeIn ?? 0} onChange={num('fadeIn')} step={0.02} min={0} unit="s" />}
        {!anim && <NumberField label="Fade Out" value={(c as AnyClip).fadeOut ?? 0} onChange={num('fadeOut')} step={0.02} min={0} unit="s" />}
        {!anim && !ui && ((c as AnyClip).fadeIn ?? 0) + ((c as AnyClip).fadeOut ?? 0) > 0 && (
          <div className="dim small">At runtime, 3D objects are only shown or hidden. For a fade, a component reads the useActivation value and applies it</div>
        )}
      </Section>
    </>
  );
}

/** An Event Timeline. Its name is the event name that plays it */
function TimelineInspector({ id, scene }: { id: string; scene: StageSceneDef }) {
  useRegistry();
  const tl = scene.timelines.find((x) => x.id === id);
  const [key, setKey] = useState('');
  const [keys, setKeys] = useState<string[]>([]);
  const def = tl && tl.trigger.type !== 'none' ? registry.trigger(tl.trigger.type) : undefined;
  const params = def && tl ? defaultParams(def, tl.trigger.params) : {};
  const paramsKey = JSON.stringify(params);
  useEffect(() => {
    const read = () => setKeys(def?.keys ? def.keys(dataStore.value, params) : []);
    read();
    const t = setInterval(read, 2000);
    return () => clearInterval(t);
  }, [def, paramsKey]);
  if (!tl) return null;
  const find = (d: Draft<StageSceneDef>) => d.timelines.find((x) => x.id === id)!;
  const duplicate = scene.timelines.some((x) => x.id !== id && x.name === tl.name);
  const playKey = key || keys[0] || '';
  const types = [{ value: 'none', label: 'None' }, ...registry.triggers().map((t) => ({ value: t.type, label: t.label ?? t.type }))];
  return (
    <>
      <div className="insp-title">
        {tl.name}
        <span className="dim small">  Timeline</span>
      </div>
      <Section title="Timeline">
        <TextField label="Name" value={tl.name} onChange={(v) => edit((d) => void (find(d).name = v), { coalesce: `${id}:name` })} />
        {duplicate && <div className="warn-box">Another Timeline has the same name. Events are called by name, so rename it</div>}
        <Row label="Length">{`${+eventTimelineLength(tl).toFixed(2)} s`}</Row>
      </Section>
      <Section title="Trigger">
        <SelectField
          label="Type"
          value={tl.trigger.type}
          options={types}
          onChange={(v) =>
            edit((d) => {
              find(d).trigger = { type: v, params: {} };
            })
          }
        />
        {tl.trigger.type !== 'none' && !def && <div className="warn-box">Trigger {tl.trigger.type} is not registered</div>}
        {def &&
          Object.entries(def.params).map(([k, p]) => (
            <ParamField key={k} name={k} def={p} value={params[k]} onChange={sceneSetter((d, v) => void (find(d).trigger.params[k] = v), `${id}:t:${k}`)} />
          ))}
      </Section>
      <Section
        title="Event"
        actions={
          <button className="small-btn" onClick={() => events.fire(tl.name, playKey)}>
            Play
          </button>
        }
      >
        <Row label="Key">
          <input className="text" list={'keys-' + id} value={key} placeholder={keys[0] ?? ''} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <datalist id={'keys-' + id}>
            {keys.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Row>
      </Section>
    </>
  );
}

function AssetInspector({ path, scene }: { path: string; scene: StageSceneDef }) {
  useHandleVersion();
  const handle = useStudio((s) => s.handle);
  const info = handle.assets.get(path);
  return (
    <>
      <div className="insp-title">{path}</div>
      <Section title="glb">
        <Row label="Objects">{info?.objects.length ?? '―'}</Row>
        <Row label="Tris">{info?.triangles.toLocaleString() ?? '―'}</Row>
        <Row label="Clips">{info?.clips.length ? info.clips.join(', ') : 'None'}</Row>
        {!scene.assets.includes(path) && <div className="warn-box">Not used in this Scene</div>}
      </Section>
    </>
  );
}

function SelectionInspector() {
  const scene = useStudio((s) => s.scene);
  const selection = useStudio((s) => s.selection);
  if (!scene) return null;
  if (!selection.length) return null;
  const key = selection[0];
  const { kind, id } = parseKey(key);
  const more = selection.length > 1 ? <div className="dim small multi">+{selection.length - 1} more selected</div> : null;
  const body = (() => {
    switch (kind) {
      case 'object':
        return <ObjectInspector name={id} scene={scene} />;
      case 'placed':
        return <PlacedInspector id={id} scene={scene} />;
      case 'light':
        return <LightInspector id={id} scene={scene} />;
      case 'component':
        return <ComponentInspector id={id} scene={scene} />;
      case 'empty':
        return <EmptyInspector id={id} scene={scene} />;
      case 'camera':
        return <CameraInspector id={id} scene={scene} />;
      case 'clip':
        return <ClipInspector k={key} scene={scene} />;
      case 'timeline':
        return <TimelineInspector id={id} scene={scene} />;
      case 'asset':
        return <AssetInspector path={id} scene={scene} />;
      case 'environment':
        return <EnvironmentInspector />;
      case 'material':
        return <MaterialInspector id={id} scene={scene} />;
      default:
        return null;
    }
  })();
  return (
    <>
      {more}
      {body}
    </>
  );
}

export function Inspector() {
  return (
    <div className="panel inspector">
      <div className="panel-head">
        <span className="panel-title">Inspector</span>
      </div>
      <div className="panel-body">
        <SelectionInspector />
      </div>
    </div>
  );
}
