import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Small menu that opens below a button. Closes on an outside click or when an item is clicked */
export function Dropdown({ label, title, align = 'right', disabled, children }: { label: string; title?: string; align?: 'left' | 'right'; disabled?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="menu-anchor" ref={ref}>
      <button className={open ? 'on' : ''} onClick={() => setOpen(!open)} title={title} disabled={disabled}>
        {label} ▾
      </button>
      {open && !disabled && (
        <div className={'menu dropdown' + (align === 'left' ? ' left' : '')} onClick={(e) => (e.target as HTMLElement).closest('.menu-item') && setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="menu-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** A menu item that closes the menu when clicked. `side` shows a shortcut */
export function MenuItem({ label, side, onClick }: { label: string; side?: string; onClick: () => void }) {
  return (
    <button className="menu-item" onClick={onClick}>
      {label}
      {side && <span className="menu-side">{side}</span>}
    </button>
  );
}

export function MenuRadio<T extends string | boolean>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; side?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="menu-radio">
      <div className="menu-group">{label}</div>
      {options.map((o) => (
        <label key={String(o.value)} className="menu-check">
          <input type="radio" checked={o.value === value} onChange={() => onChange(o.value)} />
          {o.label}
          {o.side && <span className="menu-side">{o.side}</span>}
        </label>
      ))}
    </div>
  );
}
