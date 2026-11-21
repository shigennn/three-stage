import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

// Confirmation and text-input dialogs. Buttons follow the Windows order: right-aligned, confirming action first, Cancel last.
// Enter picks the first button and Esc cancels. Clicking outside does not close the dialog.

interface Choice {
  label: string;
  value: string;
}

interface TextInput {
  label: string;
  value: string;
  suffix?: string;
  /** Why the typed text is invalid, or null if it is valid */
  check: (v: string) => string | null;
}

interface Request {
  title: string;
  message?: string;
  choices: Choice[];
  input?: TextInput;
  done: (r: { value: string; text: string } | null) => void;
}

const useDialog = create<{ req: Request | null }>(() => ({ req: null }));

export const dialogOpen = () => !!useDialog.getState().req;

function open(req: Omit<Request, 'done'>) {
  return new Promise<{ value: string; text: string } | null>((resolve) => {
    const done = (r: { value: string; text: string } | null) => {
      useDialog.setState({ req: null });
      resolve(r);
    };
    useDialog.setState({ req: { ...req, done } });
  });
}

/** Returns the value of the pressed button, or null if cancelled */
export async function ask(title: string, message: string, choices: Choice[]): Promise<string | null> {
  return (await open({ title, message, choices }))?.value ?? null;
}

/** Returns the typed text, or null if cancelled */
export async function askText(title: string, input: TextInput, ok: string): Promise<string | null> {
  return (await open({ title, choices: [{ label: ok, value: 'ok' }], input }))?.text ?? null;
}

/** Asks whether to save unsaved changes. Returns true if saved or if the user chose not to save */
export async function askSave(message: string, save: () => Promise<boolean>): Promise<boolean> {
  const r = await ask('THREE Stage', message, [
    { label: 'Save', value: 'save' },
    { label: "Don't Save", value: 'discard' },
  ]);
  if (r === 'save') return save();
  return r === 'discard';
}

export function DialogHost() {
  const req = useDialog((s) => s.req);
  const [text, setText] = useState('');
  const first = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!req) return;
    setText(req.input?.value ?? '');
    const id = setTimeout(() => (req.input ? field.current?.select() : first.current?.focus()), 0);
    return () => clearTimeout(id);
  }, [req]);

  const error = req?.input ? req.input.check(text.trim()) : null;

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        req.done(null);
      } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
        e.preventDefault();
        if (!error) req.done({ value: req.choices[0].value, text: text.trim() });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [req, error, text]);

  if (!req) return null;
  return (
    <div className="dialog-back">
      <div className="dialog ask" role="dialog" aria-modal="true">
        <div className="panel-head">
          <span className="panel-title">{req.title}</span>
        </div>
        <div className="ask-body">
          {req.message && <p className="ask-message">{req.message}</p>}
          {req.input && (
            <div className="ask-input">
              <label className="ask-label" htmlFor="ask-field">
                {req.input.label}
              </label>
              <div className="ask-field">
                <input id="ask-field" className="text" ref={field} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
                {req.input.suffix && <span className="dim">{req.input.suffix}</span>}
              </div>
              {error && text.trim() && <div className="ask-error">{error}</div>}
            </div>
          )}
        </div>
        <div className="ask-buttons">
          {req.choices.map((c, i) => (
            <button
              key={c.value}
              ref={i === 0 ? first : undefined}
              className={i === 0 ? 'primary' : ''}
              disabled={i === 0 && !!error}
              onClick={() => req.done({ value: c.value, text: text.trim() })}
            >
              {c.label}
            </button>
          ))}
          <button onClick={() => req.done(null)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
