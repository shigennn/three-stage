import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Draft } from 'immer';
import type { StageSceneDef } from '@three-stage/runtime';
import { beginGesture, edit, editLive, endGesture } from '../store';

/** 'begin', 'live', 'end' for drags; 'set' for a typed value */
export type Phase = 'begin' | 'live' | 'end' | 'set';
export type OnChange<T> = (value: T, phase: Phase) => void;

/** Connects changes from number fields and the like to scene-definition changes and undo */
export function sceneSetter<T>(apply: (d: Draft<StageSceneDef>, v: T) => void, coalesce?: string): OnChange<T> {
  return (v, phase) => {
    if (phase === 'begin') {
      beginGesture();
      editLive((d) => apply(d, v));
    } else if (phase === 'live') editLive((d) => apply(d, v));
    else if (phase === 'end') {
      editLive((d) => apply(d, v));
      endGesture();
    } else edit((d) => apply(d, v), { coalesce });
  };
}

const fmt = (v: number, precision: number) => {
  const s = v.toFixed(precision);
  return s.includes('.') ? s.replace(/\.?0+$/, '') || '0' : s;
};

export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="row">
      <div className="row-label">{label}</div>
      <div className="row-value">{children}</div>
    </div>
  );
}

/** Drag the label left or right to change the value. Shift for fine steps, Ctrl to snap to increments */
export function NumberInput(props: {
  value: number;
  onChange: OnChange<number>;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  unit?: string;
  dragLabel?: ReactNode;
  width?: number;
}) {
  const { value, onChange, min = -Infinity, max = Infinity, precision = 3, unit } = props;
  const [text, setText] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const commit = () => {
    if (text === null) return;
    const v = Number(text.replace(/[^\d.eE+-]/g, ''));
    setText(null);
    if (Number.isFinite(v) && v !== value) onChange(clamp(v), 'set');
  };

  const shown = text ?? fmt(value, precision);
  return (
    <div className="num" style={props.width ? { width: props.width } : undefined}>
      {props.dragLabel !== undefined && (
        <DragLabel {...props} className="num-drag">
          {props.dragLabel}
        </DragLabel>
      )}
      <input
        value={shown}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(null);
            (e.target as HTMLInputElement).blur();
          }
          e.stopPropagation();
        }}
      />
      {unit && <span className="num-unit">{unit}</span>}
    </div>
  );
}

export function NumberField(props: Parameters<typeof NumberInput>[0] & { label: ReactNode }) {
  const { label, ...rest } = props;
  return (
    <Row label={<DragLabel {...rest}>{label}</DragLabel>}>
      <NumberInput {...rest} />
    </Row>
  );
}

function DragLabel(props: Parameters<typeof NumberInput>[0] & { children: ReactNode; className?: string }) {
  const { value, onChange, step = 0.01, min = -Infinity, max = Infinity } = props;
  const drag = useRef<{ x: number; v: number; moved: boolean; last: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const calc = (e: React.PointerEvent, d: { x: number; v: number }) => {
    let v = d.v + (e.clientX - d.x) * step * (e.shiftKey ? 0.1 : 1);
    if (e.ctrlKey) v = Math.round(v / (step * 10)) * step * 10;
    return clamp(v);
  };
  // Also close the undo entry when the browser takes over the drag for pen or touch input
  const cancel = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) onChange(d.last, 'end');
  };
  return (
    <span
      className={props.className ?? 'drag-label'}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, v: value, moved: false, last: value };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || (!d.moved && Math.abs(e.clientX - d.x) < 3)) return;
        d.last = calc(e, d);
        onChange(d.last, d.moved ? 'live' : 'begin');
        d.moved = true;
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (d?.moved) onChange(calc(e, d), 'end');
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
    >
      {props.children}
    </span>
  );
}

export function Vec3Field(props: {
  label: ReactNode;
  value: [number, number, number];
  onChange: OnChange<[number, number, number]>;
  step?: number;
  precision?: number;
}) {
  const { value, onChange } = props;
  const axis = (i: number): OnChange<number> => (v, phase) => {
    const out = [...value] as [number, number, number];
    out[i] = v;
    onChange(out, phase);
  };
  return (
    <Row label={props.label}>
      <div className="vec3">
        {(['X', 'Y', 'Z'] as const).map((a, i) => (
          <NumberInput key={a} dragLabel={a} value={value[i]} onChange={axis(i)} step={props.step} precision={props.precision} />
        ))}
      </div>
    </Row>
  );
}

export function ColorField({ label, value, onChange }: { label: ReactNode; value: string; onChange: OnChange<string> }) {
  const [local, setLocal] = useState(value);
  const started = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => setLocal(value), [value]);
  // React's onChange fires on every input. For the single commit when the picker closes, listen to the browser's change event directly
  useEffect(() => {
    const el = picker.current;
    if (!el) return;
    const done = () => {
      if (started.current) latest.current(el.value.toUpperCase(), 'end');
      started.current = false;
    };
    el.addEventListener('change', done);
    return () => el.removeEventListener('change', done);
  }, []);
  return (
    <Row label={label}>
      <div className="color">
        <input
          ref={picker}
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(local) ? local : '#000000'}
          onChange={(e) => {
            const v = e.target.value.toUpperCase();
            setLocal(v);
            latest.current(v, started.current ? 'live' : 'begin');
            started.current = true;
          }}
        />
        <input
          className="color-hex"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => /^#[0-9a-f]{6}$/i.test(local) && local !== value && onChange(local.toUpperCase(), 'set')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            e.stopPropagation();
          }}
        />
      </div>
    </Row>
  );
}

export function CheckField({ label, value, onChange }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </Row>
  );
}

export function SelectField<T extends string>(props: {
  label: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <Row label={props.label}>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  );
}

export function TextField({ label, value, onChange }: { label: ReactNode; value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <Row label={label}>
      <input
        className="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => local !== value && onChange(local)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setLocal(value);
          e.stopPropagation();
        }}
      />
    </Row>
  );
}

export const DRAG_ASSET = 'application/x-three-stage-asset';

/** A field that accepts files dropped from Assets (textures, HDRIs, .glb) */
export function AssetSlot(props: { label: ReactNode; value: string | undefined; accept: string[]; onChange: (v: string | undefined) => void }) {
  const [over, setOver] = useState(false);
  const ok = (p: string) => props.accept.some((ext) => p.toLowerCase().endsWith(ext));
  return (
    <Row label={props.label}>
      <div
        className={'slot' + (over ? ' over' : '')}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DRAG_ASSET)) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          const p = e.dataTransfer.getData(DRAG_ASSET);
          if (p && ok(p)) {
            e.preventDefault();
            props.onChange(p);
          }
        }}
        title={props.value}
      >
        <span className="slot-name">{props.value ? props.value.split('/').pop() : 'None'}</span>
        {props.value && (
          <button className="icon-btn" onClick={() => props.onChange(undefined)} title="Clear">
            ×
          </button>
        )}
      </div>
    </Row>
  );
}

export function Section({ title, children, actions }: { title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="section">
      <div className="section-head" onClick={() => setOpen(!open)}>
        <span className="caret">{open ? '▾' : '▸'}</span>
        <span className="section-title">{title}</span>
        <span className="section-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </span>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}
