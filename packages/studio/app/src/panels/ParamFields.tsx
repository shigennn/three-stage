import { useEffect, useState } from 'react';
import { listPaths, type ParamDef } from '@three-stage/runtime';
import { useHandleVersion, useStudio } from '../store';
import { dataStore } from '../mock';
import { AssetSlot, CheckField, ColorField, NumberField, Row, SelectField, TextField, type OnChange } from '../ui/fields';
import { EyedropperIcon } from '../ui/icons';

// Fields shared by components and shader materials. Built from the params and binding the project registered.

/** Pick from the list, or press the eyedropper and click an object in the Viewport, to fill in its name */
export function PickField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const picking = useStudio((s) => !!s.eyedropper);
  const handle = useStudio((s) => s.handle);
  useHandleVersion();
  // Objects a component laid out (each one individually) can also be picked if they have a name
  const parts = [...handle.components.values()].flatMap((g) => g.children.map((c) => c.name).filter(Boolean));
  const names = [
    ...new Set([
      ...handle.objects.keys(),
      ...[...handle.placed.values(), ...handle.components.values(), ...handle.empties.values()].map((o) => o.name),
      ...parts,
    ]),
  ];
  return (
    <Row label={label}>
      <div className="slot-row">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">None</option>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          {value && !names.includes(value) && <option value={value}>⚠ {value}</option>}
        </select>
        <button
          className={'small-btn icon-only' + (picking ? ' on' : '')}
          onClick={() => useStudio.setState({ eyedropper: picking ? null : (name: string) => onChange(name) })}
          title="Click an object in the Viewport to pick it"
        >
          <EyedropperIcon />
        </button>
      </div>
    </Row>
  );
}

export function ParamField({ name, def, value, onChange }: { name: string; def: ParamDef; value: any; onChange: OnChange<any> }) {
  const label = def.label ?? name;
  switch (def.type) {
    case 'number': {
      const span = def.min !== undefined && def.max !== undefined ? def.max - def.min : 10;
      return <NumberField label={label} value={Number(value)} onChange={onChange} min={def.min} max={def.max} step={def.step ?? span / 200} unit={def.unit} precision={4} />;
    }
    case 'color':
      return <ColorField label={label} value={String(value)} onChange={onChange} />;
    case 'boolean':
      return <CheckField label={label} value={!!value} onChange={(v) => onChange(v, 'set')} />;
    case 'select':
      return <SelectField label={label} value={String(value)} options={def.options.map((o) => ({ value: o, label: o }))} onChange={(v) => onChange(v, 'set')} />;
    case 'text':
      return <TextField label={label} value={String(value ?? '')} onChange={(v) => onChange(v, 'set')} />;
    case 'asset':
      return (
        <AssetSlot
          label={label}
          value={value || undefined}
          accept={def.kind === 'glb' ? ['.glb'] : ['.png', '.jpg', '.jpeg', '.ktx2', '.webp']}
          onChange={(v) => onChange(v ?? '', 'set')}
        />
      );
    case 'object':
      return <PickField label={label} value={String(value ?? '')} onChange={(v) => onChange(v, 'set')} />;
    case 'material':
      return <MaterialPickField label={label} value={String(value ?? '')} onChange={(v) => onChange(v, 'set')} />;
  }
}

/** Picks a material from the scene. The value is its id */
function MaterialPickField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const materials = useStudio((s) => s.scene?.materials ?? {});
  const options = [{ value: '', label: 'None' }, ...Object.entries(materials).map(([id, m]) => ({ value: id, label: m.name }))];
  if (value && !(value in materials)) options.push({ value, label: '⚠ ' + value });
  return <SelectField label={label} value={value} options={options} onChange={onChange} />;
}

export function DataPathField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [paths, setPaths] = useState<string[]>(() => listPaths(dataStore.value));
  useEffect(() => {
    const id = setInterval(() => setPaths(listPaths(dataStore.value)), 2000);
    return () => clearInterval(id);
  }, []);
  return (
    <Row label={label}>
      <input className="text" list={'paths-' + label} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <datalist id={'paths-' + label}>
        {paths.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </Row>
  );
}
