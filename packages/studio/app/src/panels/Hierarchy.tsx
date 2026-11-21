import { useEffect, useRef, useState, type ReactNode } from 'react';
import { defaultParams, defaultShadow, registry, useRegistry, type LightType } from '@three-stage/runtime';
import { edit, log, newId, notify, select, uniqueName, useHandleVersion, useStudio, type ItemKey } from '../store';
import { canDelete, canRename, deleteItem, duplicateItem, itemName, renameItem } from '../items';
import { DRAG_ASSET } from '../ui/fields';
import { currentFrameView } from '../viewport/EditorCamera';
import { viewport } from '../viewport/refs';
import { dataStore } from '../mock';
import { reveal } from '../api';
import { viewFromCamera } from '../keys';
import { EyeIcon, EyeOffIcon, LockIcon, UnlockIcon } from '../ui/icons';

export const LIGHT_CLASS: Record<LightType, string> = {
  directional: 'DirectionalLight',
  point: 'PointLight',
  spot: 'SpotLight',
  hemisphere: 'HemisphereLight',
  ambient: 'AmbientLight',
};

export function addLight(type: LightType) {
  const id = newId('light');
  const name = uniqueName(LIGHT_CLASS[type]);
  const t = viewport.controls?.target;
  const at: [number, number, number] = t ? [t.x, t.y, t.z] : [0, 0, 0];
  edit((d) => {
    d.lights.push({
      id,
      name,
      type,
      color: '#FFFFFF',
      intensity: type === 'directional' ? 2 : type === 'hemisphere' || type === 'ambient' ? 1 : 30,
      position: type === 'directional' ? [at[0] + 20, at[1] + 30, at[2] + 15] : [at[0], at[1] + 4, at[2]],
      target: at,
      castShadow: type === 'directional',
      ...(type === 'directional' ? { shadow: defaultShadow() } : {}),
      ...(type === 'hemisphere' ? { groundColor: '#B0B4BA' } : {}),
      ...(type === 'spot' ? { angle: 30, penumbra: 0.3, distance: 0, decay: 2 } : {}),
      ...(type === 'point' ? { distance: 0, decay: 2 } : {}),
    });
  });
  select(['light:' + id]);
}

export function addComponent(type: string) {
  const def = registry.component(type);
  if (!def) return;
  const id = newId('component');
  const name = uniqueName(def.label ?? type);
  const t = viewport.controls?.target;
  edit((d) => {
    d.components.push({
      id,
      name,
      type,
      enabled: true,
      params: defaultParams(def, {}),
      binding: {},
      position: t ? [t.x, 0, t.z] : [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
  });
  select(['component:' + id]);
}

/** Creates a camera from the current view. Inserted after the selected camera, or at the end if no camera is selected */
export function addCamera() {
  const v = currentFrameView();
  if (!v) return;
  const id = newId('camera');
  const name = uniqueName('Camera');
  const after = useStudio.getState().selection.find((k) => k.startsWith('camera:'))?.slice(7);
  edit((d) => {
    // New cameras start with a slow Drift so the shot isn't static
    const c = {
      id,
      name,
      position: v.position,
      target: v.target,
      fov: v.fov,
      duration: 10,
      blend: 1.5,
      easing: 'easeInOut' as const,
      motion: { type: 'stage.drift', params: {} },
    };
    const i = after ? d.cameras.findIndex((x) => x.id === after) : -1;
    d.cameras.splice(i >= 0 ? i + 1 : d.cameras.length, 0, c);
  });
  select(['camera:' + id]);
}

function addEmpty() {
  const id = newId('empty');
  const t = viewport.controls?.target;
  edit((d) => {
    d.empties.push({ id, name: uniqueName('Empty'), position: t ? [t.x, t.y + 1, t.z] : [0, 1, 0] });
  });
  select(['empty:' + id]);
}

export function deleteSelected() {
  const s = useStudio.getState();
  const keys = s.selection.filter(canDelete);
  if (!keys.length) {
    if (s.selection.some((k) => k.startsWith('object:'))) notify('warn', 'Objects in a glb cannot be deleted here. Remove them in your modeling tool and export the glb again');
    return;
  }
  edit((d) => keys.forEach((k) => deleteItem(d, k)));
  select([]);
}

export function duplicateSelected(): ItemKey[] {
  const s = useStudio.getState();
  const keys = s.selection.filter(canDelete);
  const out: ItemKey[] = [];
  edit((d) => {
    for (const k of keys) {
      const n = duplicateItem(d, k);
      if (n) out.push(n);
    }
  });
  if (out.length) select(out);
  return out;
}

function AddMenu({ onClose }: { onClose: () => void }) {
  useRegistry();
  const comps = registry.components();
  const item = (label: string, f: () => void) => (
    <button
      key={label}
      className="menu-item"
      onClick={() => {
        f();
        onClose();
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="menu" onMouseLeave={onClose}>
      <div className="menu-group">Light</div>
      {item('DirectionalLight', () => addLight('directional'))}
      {item('PointLight', () => addLight('point'))}
      {item('SpotLight', () => addLight('spot'))}
      {item('HemisphereLight', () => addLight('hemisphere'))}
      {comps.length > 0 && <div className="menu-group">Components</div>}
      {comps.map((c) => item(c.label || c.type, () => addComponent(c.type)))}
      <div className="menu-sep" />
      {item('Camera', addCamera)}
      {item('Empty', addEmpty)}
    </div>
  );
}

function ContextMenu({ at, k, onClose, onRename }: { at: { x: number; y: number }; k: ItemKey; onClose: () => void; onRename: () => void }) {
  const isAsset = k.startsWith('asset:');
  const item = (label: string, f: () => void, disabled = false, key?: string) => (
    <button
      className="menu-item"
      disabled={disabled}
      onClick={() => {
        f();
        onClose();
      }}
    >
      {label}
      {key && <span className="menu-side">{key}</span>}
    </button>
  );
  return (
    <div className="menu" style={{ position: 'fixed', left: at.x, top: at.y }} onMouseLeave={onClose}>
      {isAsset ? (
        <>
          {item('Show in Explorer', () => reveal(k.slice(6)))}
          {item('Remove from Scene', () => {
            const path = k.slice(6);
            edit((d) => void (d.assets = d.assets.filter((a) => a !== path)));
          })}
        </>
      ) : (
        <>
          {item('Rename', onRename, !canRename(k), 'F2')}
          {item('Duplicate', duplicateSelected, !canDelete(k), 'Shift D')}
          {item('Delete', deleteSelected, !canDelete(k), 'X')}
        </>
      )}
    </div>
  );
}

function ItemRow(props: { k: ItemKey; label: ReactNode; indent?: boolean; title?: string; renaming: boolean; onRename: () => void; onRenameDone: () => void; onContext: (e: React.MouseEvent) => void }) {
  const { k } = props;
  const selected = useStudio((s) => s.selection.includes(k));
  const hidden = useStudio((s) => s.hidden.has(k));
  const locked = useStudio((s) => s.locked.has(k));
  const scene = useStudio((s) => s.scene);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const toggle = (which: 'hidden' | 'locked') => (e: React.MouseEvent) => {
    e.stopPropagation();
    useStudio.setState((s) => {
      const next = new Set(s[which]);
      next.has(k) ? next.delete(k) : next.add(k);
      return { [which]: next } as any;
    });
  };
  const canHide = !k.startsWith('camera:') && k !== 'environment' && !k.startsWith('asset:');
  return (
    <div
      ref={ref}
      className={'item' + (selected ? ' selected' : '') + (hidden ? ' hidden' : '') + (props.indent ? ' indent' : '')}
      onClick={(e) => select([k], e.shiftKey || e.ctrlKey)}
      onDoubleClick={() => {
        if (k.startsWith('camera:')) viewFromCamera(k.slice(7));
        else if (canRename(k)) props.onRename();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!selected) select([k]);
        props.onContext(e);
      }}
      title={props.title}
    >
      {props.renaming ? (
        <input
          autoFocus
          className="rename"
          defaultValue={itemName(k, scene)}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== itemName(k, scene)) edit((d) => renameItem(d, k, uniqueName(v)));
            props.onRenameDone();
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') props.onRenameDone();
          }}
        />
      ) : (
        <span className="item-name">{props.label}</span>
      )}
      {canHide && (
        <>
          <button className={'icon-btn' + (hidden ? ' on' : '')} onClick={toggle('hidden')} title="Hide  H (Viewport only, not saved)">
            {hidden ? <EyeOffIcon /> : <EyeIcon />}
          </button>
          <button className={'icon-btn' + (locked ? ' on' : '')} onClick={toggle('locked')} title="Lock  Make unselectable in the Viewport (not saved)">
            {locked ? <LockIcon /> : <UnlockIcon />}
          </button>
        </>
      )}
    </div>
  );
}

function Group({ title, children, count }: { title: string; children: ReactNode; count: number }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="group">
      <div className="group-head" onClick={() => setOpen(!open)}>
        <span className="caret">{open ? '▾' : '▸'}</span>
        {title}
        <span className="dim"> {count}</span>
      </div>
      {open && children}
    </div>
  );
}

export function Hierarchy() {
  useRegistry();
  const scene = useStudio((s) => s.scene);
  useHandleVersion();
  const handle = useStudio((s) => s.handle);
  const [filter, setFilter] = useState('');
  const [menu, setMenu] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; k: ItemKey } | null>(null);
  const [renaming, setRenaming] = useState<ItemKey | null>(null);
  const [dropOver, setDropOver] = useState(false);

  useEffect(() => {
    const f = (e: Event) => {
      const k = (e as CustomEvent).detail as ItemKey;
      if (canRename(k)) setRenaming(k);
    };
    window.addEventListener('stage:rename', f);
    return () => window.removeEventListener('stage:rename', f);
  }, []);

  if (!scene) return <div className="panel hierarchy" />;
  const q = filter.trim().toLowerCase();
  const match = (name: string) => !q || name.toLowerCase().includes(q);
  const row = (k: ItemKey, label: ReactNode, name: string, extra: { indent?: boolean; title?: string } = {}) =>
    match(name) ? (
      <ItemRow
        key={k}
        k={k}
        label={label}
        {...extra}
        renaming={renaming === k}
        onRename={() => setRenaming(k)}
        onRenameDone={() => setRenaming(null)}
        onContext={(e) => setCtx({ x: e.clientX, y: e.clientY, k })}
      />
    ) : null;

  const modelCount = scene.assets.reduce((n, a) => n + (handle.assets.get(a)?.objects.length ?? 0), 0) + scene.placed.length;

  return (
    <div
      className={'panel hierarchy' + (dropOver ? ' drop' : '')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_ASSET)) {
          e.preventDefault();
          setDropOver(true);
        }
      }}
      onDragLeave={() => setDropOver(false)}
      onDrop={(e) => {
        setDropOver(false);
        const p = e.dataTransfer.getData(DRAG_ASSET);
        if (!p?.toLowerCase().endsWith('.glb')) return;
        e.preventDefault();
        if (scene.assets.includes(p)) return log('info', `${p} is already in this Scene`);
        edit((d) => void d.assets.push(p));
        log('info', `Added ${p}`, { kind: 'asset', path: p });
      }}
    >
      <div className="panel-head">
        <span className="panel-title">Hierarchy</span>
        <div className="spacer" />
        <div className="menu-anchor">
          <button onClick={() => setMenu(!menu)} title="Add">
            ＋
          </button>
          {menu && <AddMenu onClose={() => setMenu(false)} />}
        </div>
      </div>
      <input className="filter" placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <div className="panel-body">
        <Group title="Models" count={modelCount}>
          {scene.assets.map((path) => (
            <div key={path}>
              {row('asset:' + path, <span className="asset-row">{path.split('/').pop()}</span>, path, { title: path })}
              {(handle.assets.get(path)?.objects ?? []).map((o) => row('object:' + o.name, o.name, o.name, { indent: true, title: `${o.triangles.toLocaleString()} tris` }))}
            </div>
          ))}
          {scene.placed.map((p) => row('placed:' + p.id, p.name, p.name, { title: p.asset }))}
        </Group>
        <Group title="Lights" count={scene.lights.length}>
          {scene.lights.map((l) => row('light:' + l.id, l.name, l.name, { title: LIGHT_CLASS[l.type] }))}
        </Group>
        <Group title="Environment" count={1}>
          {row('environment', 'Environment', 'environment')}
        </Group>
        <Group title="Components" count={scene.components.length}>
          {scene.components.map((c) => {
            const def = registry.component(c.type);
            const n = def?.count?.(defaultParams(def, c.params), dataStore.value, c.binding);
            return row('component:' + c.id, n !== undefined ? `${c.name} ×${n}` : c.name, c.name, { title: c.type });
          })}
        </Group>
        <Group title="Empties" count={scene.empties.length}>
          {scene.empties.map((e) => row('empty:' + e.id, e.name, e.name))}
        </Group>
        <Group title="Cameras" count={scene.cameras.length}>
          {scene.cameras.map((c) => row('camera:' + c.id, c.name, c.name))}
        </Group>
      </div>
      {ctx && <ContextMenu at={ctx} k={ctx.k} onClose={() => setCtx(null)} onRename={() => setRenaming(ctx.k)} />}
    </div>
  );
}
