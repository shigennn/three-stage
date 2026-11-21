import { useState } from 'react';
import { importFile, reveal } from '../api';
import { blockedByBranch, log, openScene, useStudio } from '../store';
import { DRAG_ASSET } from '../ui/fields';
import { ask } from '../ui/Dialog';
import { confirmDiscard } from './Toolbar';
import { MaterialList } from './MaterialInspector';

const FOLDERS = [
  { dir: 'glb', title: 'glb' },
  { dir: 'textures', title: 'textures' },
  { dir: 'hdr', title: 'hdr' },
  { dir: 'scenes', title: 'scenes' },
];

const size = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

/** Contents of content/. Drag .glb files onto the Viewport or Hierarchy, and textures and HDRIs onto Inspector fields */
export function Assets() {
  const files = useStudio((s) => s.files);
  const scenePath = useStudio((s) => s.scenePath);
  const [open, setOpen] = useState<Record<string, boolean>>({ glb: true, textures: true, hdr: true, scenes: true });
  const [dropOver, setDropOver] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null);

  const onDrop = async (e: React.DragEvent) => {
    setDropOver(false);
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    if (blockedByBranch()) return;
    for (const f of Array.from(e.dataTransfer.files)) {
      try {
        const p = await importFile(f, async (path) => (await ask('Replace File',`content/${path} already exists. Replace it?`, [{ label: 'Replace', value: 'replace' }])) === 'replace');
        if (p) log('info', `Imported ${p}`, { kind: 'asset', path: p });
      } catch (err: any) {
        log('error', err.message);
      }
    }
  };

  return (
    <div
      className={'panel assets' + (dropOver ? ' drop' : '')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropOver(true);
        }
      }}
      onDragLeave={() => setDropOver(false)}
      onDrop={onDrop}
    >
      <div className="panel-head">
        <span className="panel-title">Assets</span>
        <div className="spacer" />
        <button onClick={() => reveal('.')}>Show in Explorer</button>
      </div>
      <div className="panel-body">
        <MaterialList />
        {FOLDERS.map(({ dir, title }) => {
          const list = files.filter((f) => f.path.startsWith(dir + '/'));
          return (
            <div className="group" key={dir}>
              <div className="group-head" onClick={() => setOpen((o) => ({ ...o, [dir]: !o[dir] }))}>
                <span className="caret">{open[dir] ? '▾' : '▸'}</span>
                {title}
                <span className="dim"> {list.length}</span>
              </div>
              {open[dir] &&
                list.map((f) => (
                  <div
                    key={f.path}
                    className={'item indent' + (f.path === scenePath ? ' current' : '')}
                    draggable={dir !== 'scenes'}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_ASSET, f.path);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDoubleClick={async () => {
                      if (dir === 'scenes' && f.path !== scenePath && (await confirmDiscard())) openScene(f.path);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, path: f.path });
                    }}
                    title={f.path}
                  >
                    <span className="item-name">{f.path.slice(dir.length + 1)}</span>
                    <span className="dim small">
                      {f.triangles != null ? `${f.triangles.toLocaleString()} tri  ` : ''}
                      {size(f.size)}
                    </span>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
      {menu && (
        <div className="menu" style={{ position: 'fixed', left: menu.x, top: menu.y }} onMouseLeave={() => setMenu(null)}>
          <button
            className="menu-item"
            onClick={() => {
              reveal(menu.path);
              setMenu(null);
            }}
          >
            Show in Explorer
          </button>
        </div>
      )}
    </div>
  );
}
