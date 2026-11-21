import { useState } from 'react';
import type { Draft } from 'immer';
import {
  defaultMaterial,
  defaultParams,
  isBuiltinMaterial,
  isBuiltinMaterialType,
  MATERIAL_MAPS,
  registry,
  useRegistry,
  type BuiltinMaterialDef,
  type MaterialDef,
  type MaterialType,
  type ShaderMaterialDef,
  type StageSceneDef,
} from '@three-stage/runtime';
import { edit, newId, select, useStudio } from '../store';
import { AssetSlot, CheckField, ColorField, NumberField, Section, SelectField, TextField, sceneSetter } from '../ui/fields';
import { DataPathField, ParamField } from './ParamFields';

// Materials belong to the scene. They are listed under Materials in Assets and edited in the Inspector.
// Field names match three.js MeshStandardMaterial and MeshPhysicalMaterial.
// Shaders registered with defineShader share the list and the Type menu; their fields are built from the registered params.

const MAP_LABEL: Record<(typeof MATERIAL_MAPS)[number], string> = {
  map: 'Map',
  normalMap: 'Normal Map',
  roughnessMap: 'Roughness Map',
  metalnessMap: 'Metalness Map',
  aoMap: 'AO Map',
  emissiveMap: 'Emissive Map',
};
const TEX = ['.png', '.jpg', '.jpeg', '.ktx2', '.webp'];
const TYPE_NAME: Record<MaterialType, string> = { standard: 'MeshStandardMaterial', physical: 'MeshPhysicalMaterial' };

/** Display name of a type: the three.js class name for built-ins, the registered label for shaders */
function typeName(type: string) {
  return isBuiltinMaterialType(type) ? TYPE_NAME[type] : (registry.shader(type)?.label ?? type);
}

/** Contents of a new material when a type is chosen. Keeps the name */
function newMaterial(name: string, type: string): MaterialDef {
  if (isBuiltinMaterialType(type)) return defaultMaterial(name, type);
  return { name, type, params: defaultParams(registry.shader(type), {}), binding: {} };
}

/** Swatch color in the Materials list. For shaders, the first color param */
function swatch(m: MaterialDef) {
  if (isBuiltinMaterial(m)) return m.color;
  const def = registry.shader(m.type);
  const k = def && Object.keys(def.params).find((x) => def.params[x].type === 'color');
  return k ? String(defaultParams(def, m.params)[k]) : '#808080';
}

function users(scene: StageSceneDef, id: string) {
  return scene.materialAssignments.filter((a) => a.material === id);
}

/** Components that point at this material through a material param (type: 'material') */
function componentUsers(scene: StageSceneDef, id: string) {
  return scene.components.filter((c) => {
    const def = registry.component(c.type);
    return !!def && Object.entries(def.params).some(([k, p]) => p.type === 'material' && defaultParams(def, c.params)[k] === id);
  });
}

const userCount = (scene: StageSceneDef, id: string) => users(scene, id).length + componentUsers(scene, id).length;

function removeMaterials(ids: string[]) {
  edit((d) => {
    for (const id of ids) delete d.materials[id];
    d.materialAssignments = d.materialAssignments.filter((a) => !ids.includes(a.material));
  });
  select([]);
}

export function MaterialInspector({ id, scene }: { id: string; scene: StageSceneDef }) {
  useRegistry();
  const m = scene.materials[id];
  if (!m) return null;
  const u = users(scene, id);
  const cu = componentUsers(scene, id);
  const duplicate = () => {
    const nid = newId('mat');
    edit((d) => {
      d.materials[nid] = { ...JSON.parse(JSON.stringify(d.materials[id])), name: d.materials[id].name + ' copy' };
    });
    select(['material:' + nid]);
  };
  const shaders = registry.shaders();
  const types = [
    { value: 'standard', label: TYPE_NAME.standard },
    { value: 'physical', label: TYPE_NAME.physical },
    ...shaders.map((x) => ({ value: x.type, label: x.label ?? x.type })),
  ];
  if (!types.some((t) => t.value === m.type)) types.push({ value: m.type, label: '⚠ ' + m.type });
  const setType = (type: string) =>
    edit((d) => {
      const cur = d.materials[id];
      if (isBuiltinMaterialType(type) && isBuiltinMaterial(cur)) cur.type = type;
      else d.materials[id] = newMaterial(cur.name, type);
    });
  return (
    <>
      <div className="insp-title">
        {m.name}
        <span className="dim small">  {typeName(m.type)}</span>
      </div>
      <Section
        title="Material"
        actions={
          <>
            <button
              className="small-btn"
              disabled={!u.length && !cu.length}
              onClick={() => {
                const keys = new Set<string>();
                for (const a of u) {
                  const p = scene.placed.find((x) => x.name === a.object);
                  keys.add(p ? 'placed:' + p.id : 'object:' + a.object);
                }
                for (const c of cu) keys.add('component:' + c.id);
                select([...keys]);
              }}
            >
              Select Users {u.length + cu.length}
            </button>
            <button className="small-btn" onClick={duplicate}>
              Duplicate
            </button>
            <button className="small-btn" onClick={() => removeMaterials([id])}>
              Delete
            </button>
          </>
        }
      >
        <TextField label="Name" value={m.name} onChange={(v) => edit((d) => void (d.materials[id].name = v))} />
        <SelectField<string> label="Type" value={m.type} options={types} onChange={setType} />
        {isBuiltinMaterial(m) && <BuiltinFields id={id} m={m} />}
      </Section>
      {isBuiltinMaterial(m) ? <BuiltinSections id={id} m={m} /> : <ShaderSections id={id} m={m} />}
    </>
  );
}

const builtin = (d: Draft<StageSceneDef>, id: string) => d.materials[id] as Draft<BuiltinMaterialDef>;

function BuiltinFields({ id, m }: { id: string; m: BuiltinMaterialDef }) {
  const num = (field: keyof BuiltinMaterialDef) => sceneSetter<number>((d, v) => void ((builtin(d, id) as any)[field] = v), `${id}:${String(field)}`);
  const col = (field: 'color' | 'emissive') => sceneSetter<string>((d, v) => void (builtin(d, id)[field] = v), `${id}:${field}`);
  return (
    <>
      <ColorField label="Color" value={m.color} onChange={col('color')} />
      <NumberField label="Roughness" value={m.roughness} onChange={num('roughness')} step={0.005} min={0} max={1} />
      <NumberField label="Metalness" value={m.metalness} onChange={num('metalness')} step={0.005} min={0} max={1} />
      <ColorField label="Emissive" value={m.emissive} onChange={col('emissive')} />
      <NumberField label="Emissive Intensity" value={m.emissiveIntensity} onChange={num('emissiveIntensity')} step={0.01} min={0} />
      <NumberField label="Env Map Intensity" value={m.envMapIntensity} onChange={num('envMapIntensity')} step={0.01} min={0} />
      <CheckField label="Transparent" value={m.transparent} onChange={(v) => edit((d) => void (builtin(d, id).transparent = v))} />
      {m.transparent && <NumberField label="Opacity" value={m.opacity} onChange={num('opacity')} step={0.005} min={0} max={1} />}
    </>
  );
}

function BuiltinSections({ id, m }: { id: string; m: BuiltinMaterialDef }) {
  const num = (field: keyof BuiltinMaterialDef) => sceneSetter<number>((d, v) => void ((builtin(d, id) as any)[field] = v), `${id}:${String(field)}`);
  return (
    <>
      {m.type === 'physical' && (
        <Section title="MeshPhysicalMaterial">
          <NumberField label="Clearcoat" value={m.clearcoat ?? 0} onChange={num('clearcoat')} step={0.005} min={0} max={1} />
          <NumberField label="Clearcoat Roughness" value={m.clearcoatRoughness ?? 0} onChange={num('clearcoatRoughness')} step={0.005} min={0} max={1} />
          <NumberField label="Transmission" value={m.transmission ?? 0} onChange={num('transmission')} step={0.005} min={0} max={1} />
          <NumberField label="Thickness" value={m.thickness ?? 0} onChange={num('thickness')} step={0.01} min={0} unit="m" />
          <NumberField label="IOR" value={m.ior ?? 1.5} onChange={num('ior')} step={0.005} min={1} max={2.333} />
          <NumberField label="Sheen" value={m.sheen ?? 0} onChange={num('sheen')} step={0.005} min={0} max={1} />
          <ColorField label="Sheen Color" value={m.sheenColor ?? '#FFFFFF'} onChange={sceneSetter<string>((d, v) => void (builtin(d, id).sheenColor = v), `${id}:sheenColor`)} />
        </Section>
      )}
      <Section title="Textures">
        {MATERIAL_MAPS.map((k) => (
          <AssetSlot key={k} label={MAP_LABEL[k]} value={m[k]} accept={TEX} onChange={(v) => edit((d) => void (v ? (builtin(d, id)[k] = v) : delete builtin(d, id)[k]))} />
        ))}
      </Section>
    </>
  );
}

function ShaderSections({ id, m }: { id: string; m: ShaderMaterialDef }) {
  const def = registry.shader(m.type);
  if (!def) return <div className="warn-box">Shader {m.type} is not registered. Drawn in pink</div>;
  const params = defaultParams(def, m.params);
  const shader = (d: Draft<StageSceneDef>) => d.materials[id] as Draft<ShaderMaterialDef>;
  return (
    <>
      <Section title={def.label ?? def.type}>
        {Object.entries(def.params).map(([k, p]) => (
          <ParamField key={k} name={k} def={p} value={params[k]} onChange={sceneSetter((d, v) => void (shader(d).params[k] = v), `${id}:p:${k}`)} />
        ))}
      </Section>
      {def.binding && Object.keys(def.binding).length > 0 && (
        <Section title="Binding">
          {Object.keys(def.binding).map((k) => (
            <DataPathField key={k} label={k} value={m.binding[k] ?? ''} onChange={(v) => edit((d) => void (shader(d).binding[k] = v), { coalesce: `${id}:b:${k}` })} />
          ))}
        </Section>
      )}
    </>
  );
}

/** The Materials section in Assets: the scene's materials, with a menu to add materials and remove unused ones */
export function MaterialList() {
  const scene = useStudio((s) => s.scene);
  const selection = useStudio((s) => s.selection);
  const [open, setOpen] = useState(true);
  const [menu, setMenu] = useState(false);
  useRegistry();
  if (!scene) return null;
  const list = Object.entries(scene.materials);
  const create = (type: string) => {
    const id = newId('mat');
    edit((d) => {
      d.materials[id] = newMaterial(typeName(type), type);
    });
    select(['material:' + id]);
    setMenu(false);
  };
  const unused = list.filter(([id]) => !userCount(scene, id)).map(([id]) => id);
  return (
    <div className="group">
      <div className="group-head" onClick={() => setOpen(!open)}>
        <span className="caret">{open ? '▾' : '▸'}</span>
        Materials
        <span className="dim"> {list.length}</span>
        <div className="spacer" />
        <div className="menu-anchor" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn on" onClick={() => setMenu(!menu)} title="Add">
            ＋
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <button className="menu-item" onClick={() => create('standard')}>
                {TYPE_NAME.standard}
              </button>
              <button className="menu-item" onClick={() => create('physical')}>
                {TYPE_NAME.physical}
              </button>
              {registry.shaders().length > 0 && <div className="menu-sep" />}
              {registry.shaders().map((x) => (
                <button key={x.type} className="menu-item" onClick={() => create(x.type)}>
                  {x.label ?? x.type}
                  <span className="menu-side">{x.type}</span>
                </button>
              ))}
              <div className="menu-sep" />
              <button
                className="menu-item"
                onClick={() => {
                  setMenu(false);
                  removeMaterials(unused);
                }}
                disabled={!unused.length}
              >
                Delete Unused
                <span className="menu-side">{unused.length}</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {open &&
        list.map(([id, m]) => (
          <div key={id} className={'item indent' + (selection.includes('material:' + id) ? ' selected' : '')} onClick={() => select(['material:' + id])}>
            <span className="swatch" style={{ background: swatch(m) }} />
            <span className="item-name">{m.name}</span>
            <span className="dim small">{userCount(scene, id)}</span>
          </div>
        ))}
    </div>
  );
}
