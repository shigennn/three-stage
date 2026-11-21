import type { Draft } from 'immer';
import {
  defaultParams,
  isBuiltinPostEffect,
  POST_EFFECTS,
  POST_ORDER,
  postParam,
  registry,
  useRegistry,
  type EnvironmentDef,
  type PostEffectDef,
  type PostEffectType,
  PROBE_SIZES,
  type StageSceneDef,
  type ToneMappingName,
} from '@three-stage/runtime';
import { edit, newId, useStudio } from '../store';
import { AssetSlot, CheckField, ColorField, NumberField, Section, SelectField, Vec3Field, sceneSetter } from '../ui/fields';
import { Dropdown, MenuItem } from '../ui/Dropdown';
import { DataPathField, ParamField } from './ParamFields';

// Names match the properties of the three.js Scene (environment, background, fog) and WebGLRenderer (toneMapping, shadowMap)

const TONE: { value: ToneMappingName; label: string }[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'agx', label: 'AgX' },
  { value: 'aces', label: 'ACES Filmic' },
  { value: 'reinhard', label: 'Reinhard' },
  { value: 'cineon', label: 'Cineon' },
  { value: 'linear', label: 'Linear' },
  { value: 'none', label: 'None' },
];

/** Built-in effects in their fixed order, followed by registered effects in the order they were added */
const postOrder = (type: string) => (isBuiltinPostEffect(type) ? POST_ORDER.indexOf(type) : POST_ORDER.length);

/** An effect registered with definePostEffect. Its fields are built from the registered params */
function CustomEffect({ fx }: { fx: PostEffectDef }) {
  const def = registry.postEffect(fx.type);
  const find = (d: Draft<StageSceneDef>) => d.postprocess.find((q) => q.id === fx.id);
  const params = defaultParams(def, fx.params);
  return (
    <div className="post-fx">
      <div className="slot-row">
        <CheckField label={def?.label ?? fx.type} value={fx.enabled} onChange={(v) => edit((d) => void (find(d)!.enabled = v))} />
        <button className="small-btn" onClick={() => edit((d) => void (d.postprocess = d.postprocess.filter((q) => q.id !== fx.id)))}>
          Remove
        </button>
      </div>
      {!def && <div className="warn-box">Post effect {fx.type} is not registered</div>}
      {def &&
        fx.enabled &&
        Object.entries(def.params).map(([k, p]) => (
          <ParamField key={k} name={k} def={p} value={params[k]} onChange={sceneSetter((d, v) => void (find(d)!.params[k] = v), `post:${fx.id}:${k}`)} />
        ))}
      {def &&
        fx.enabled &&
        Object.keys(def.binding ?? {}).map((k) => (
          <DataPathField
            key={k}
            label={k}
            value={fx.binding?.[k] ?? ''}
            onChange={(v) =>
              edit(
                (d) => {
                  const x = find(d)!;
                  x.binding = { ...x.binding, [k]: v };
                },
                { coalesce: `post:${fx.id}:b:${k}` },
              )
            }
          />
        ))}
    </div>
  );
}

/** Built-in effects render in POST_ORDER, which can't be changed. Registered effects apply at their chosen stage, in the order they were added */
function PostSection({ scene }: { scene: StageSceneDef }) {
  useRegistry();
  const custom = scene.postprocess.filter((p) => !isBuiltinPostEffect(p.type));
  const registered = registry.postEffects();
  const add = (type: string) => {
    const id = newId('fx');
    edit((d) => void d.postprocess.push({ id, type, enabled: true, params: defaultParams(registry.postEffect(type), {}), binding: {} }));
  };
  const toggle = (type: PostEffectType, on: boolean) => {
    const id = newId('fx');
    edit((d) => {
      const fx = d.postprocess.find((p) => p.type === type);
      if (fx) fx.enabled = on;
      else if (on) {
        const params = Object.fromEntries(Object.entries(POST_EFFECTS[type].params).map(([k, p]) => [k, p.default]));
        d.postprocess.push({ id, type, enabled: true, params });
        d.postprocess.sort((a, b) => postOrder(a.type) - postOrder(b.type));
      }
    });
  };
  return (
    <Section
      title="Post Processing"
      actions={
        registered.length > 0 && (
          <Dropdown label="Add">
            {registered.map((x) => (
              <MenuItem key={x.type} label={x.label ?? x.type} side={x.stage === 'hdr' ? 'Before Tone Mapping' : 'After Tone Mapping'} onClick={() => add(x.type)} />
            ))}
          </Dropdown>
        )
      }
    >
      {POST_ORDER.map((type) => {
        const def = POST_EFFECTS[type];
        const fx = scene.postprocess.find((p) => p.type === type);
        return (
          <div key={type} className="post-fx">
            <CheckField label={def.label} value={!!fx?.enabled} onChange={(v) => toggle(type, v)} />
            {fx?.enabled &&
              Object.entries(def.params).map(([k, p]) => (
                <NumberField
                  key={k}
                  label={p.label}
                  value={postParam(fx, k)}
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  onChange={sceneSetter<number>((d, v) => {
                    const x = d.postprocess.find((q) => q.type === type);
                    if (x) x.params[k] = v;
                  }, `post:${type}:${k}`)}
                />
              ))}
          </div>
        );
      })}
      {custom.map((fx) => (
        <CustomEffect key={fx.id} fx={fx} />
      ))}
    </Section>
  );
}

/** Inspector for the Environment item: scene-wide settings and post-processing */
export function EnvironmentInspector() {
  const scene = useStudio((s) => s.scene);
  if (!scene) return null;
  const e = scene.environment;
  const env = (d: Draft<StageSceneDef>) => d.environment as Draft<EnvironmentDef>;
  const num = (f: (x: Draft<EnvironmentDef>, v: number) => void, key: string) => sceneSetter<number>((d, v) => f(env(d), v), 'env:' + key);
  return (
    <div className="lighting">
      <div className="insp-title">Environment</div>
      <Section title="Environment">
        <SelectField
          label="Environment"
          value={e.source}
          options={[
            { value: 'room', label: 'Room Environment' },
            { value: 'hdri', label: 'HDRI' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(v) => edit((d) => void (env(d).source = v as EnvironmentDef['source']))}
        />
        {e.source === 'hdri' && (
          <>
            <AssetSlot label="HDRI" value={e.hdri} accept={['.hdr', '.exr']} onChange={(v) => edit((d) => void (v ? (env(d).hdri = v) : delete env(d).hdri))} />
            <AssetSlot label="HDRI B" value={e.hdriB} accept={['.hdr', '.exr']} onChange={(v) => edit((d) => void (v ? (env(d).hdriB = v) : delete env(d).hdriB))} />
            {e.hdriB && <NumberField label="Blend" value={e.blend} onChange={num((x, v) => void (x.blend = v), 'blend')} step={0.01} min={0} max={1} />}
          </>
        )}
        <NumberField label="Environment Intensity" value={e.intensity} onChange={num((x, v) => void (x.intensity = v), 'intensity')} step={0.01} min={0} />
        <NumberField label="Environment Rotation" value={e.rotation} onChange={num((x, v) => void (x.rotation = v), 'rotation')} step={0.5} unit="°" />
      </Section>
      <Section title="Reflection Probe">
        <CheckField label="Enabled" value={e.reflection.enabled} onChange={(v) => edit((d) => void (env(d).reflection.enabled = v))} />
        {e.reflection.enabled && (
          <>
            <Vec3Field
              label="Position"
              value={e.reflection.position}
              onChange={sceneSetter((d, v) => void (env(d).reflection.position = v), 'env:probe')}
              step={0.05}
              precision={2}
            />
            <SelectField
              label="Resolution"
              value={String(e.reflection.resolution)}
              options={PROBE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(v) => edit((d) => void (env(d).reflection.resolution = Number(v)))}
            />
          </>
        )}
      </Section>
      <Section title="Background">
        <SelectField
          label="Background"
          value={e.background.type}
          options={[
            { value: 'color', label: 'Color' },
            { value: 'environment', label: 'Environment' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(v) => edit((d) => void (env(d).background.type = v as EnvironmentDef['background']['type']))}
        />
        {e.background.type === 'color' && <ColorField label="Color" value={e.background.color} onChange={sceneSetter((d, v) => void (env(d).background.color = v), 'env:bg')} />}
        {e.background.type === 'environment' && (
          <NumberField label="Background Blurriness" value={e.background.blur} onChange={num((x, v) => void (x.background.blur = v), 'blur')} step={0.005} min={0} max={1} />
        )}
      </Section>
      <Section title="Fog">
        <CheckField label="Enabled" value={e.fog.enabled} onChange={(v) => edit((d) => void (env(d).fog.enabled = v))} />
        {e.fog.enabled && (
          <>
            <ColorField label="Color" value={e.fog.color} onChange={sceneSetter((d, v) => void (env(d).fog.color = v), 'env:fog')} />
            <NumberField label="Near" value={e.fog.near} onChange={num((x, v) => void (x.fog.near = v), 'near')} step={0.5} min={0} unit="m" />
            <NumberField label="Far" value={e.fog.far} onChange={num((x, v) => void (x.fog.far = v), 'far')} step={0.5} min={0} unit="m" />
          </>
        )}
      </Section>
      <Section title="Tone Mapping">
        <SelectField<ToneMappingName> label="Tone Mapping" value={e.toneMapping} options={TONE} onChange={(v) => edit((d) => void (env(d).toneMapping = v))} />
        <NumberField label="Tone Mapping Exposure" value={e.exposure} onChange={num((x, v) => void (x.exposure = v), 'exposure')} step={0.005} min={0} />
      </Section>
      <Section title="Shadow Map">
        <CheckField label="Enabled" value={e.shadows.enabled} onChange={(v) => edit((d) => void (env(d).shadows.enabled = v))} />
        <SelectField
          label="Type"
          value={e.shadows.type}
          options={[
            { value: 'pcf', label: 'PCF' },
            { value: 'vsm', label: 'VSM' },
            { value: 'basic', label: 'Basic' },
          ]}
          onChange={(v) => edit((d) => void (env(d).shadows.type = v as EnvironmentDef['shadows']['type']))}
        />
      </Section>
      <PostSection scene={scene} />
    </div>
  );
}
