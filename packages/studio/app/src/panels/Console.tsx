import { useEffect, useRef, useState } from 'react';
import { keyOf, select, useStudio, type LogEntry } from '../store';

const time = (d: Date) => d.toTimeString().slice(0, 8);

export function Console() {
  const logs = useStudio((s) => s.logs);
  const [show, setShow] = useState({ info: true, warn: true, error: true });
  const body = useRef<HTMLDivElement>(null);
  const list = logs.filter((l) => show[l.level]);
  const count = (lv: LogEntry['level']) => logs.filter((l) => l.level === lv).length;

  const lastId = logs[logs.length - 1]?.id;
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  return (
    <div className="console">
      <div className="console-tools">
        {(['info', 'warn', 'error'] as const).map((lv) => (
          <button key={lv} className={'lv ' + lv + (show[lv] ? ' on' : '')} onClick={() => setShow((s) => ({ ...s, [lv]: !s[lv] }))}>
            <span className="lv-dot">●</span>
            {{ info: 'Info', warn: 'Warning', error: 'Error' }[lv]} {count(lv)}
          </button>
        ))}
        <div className="spacer" />
        <button onClick={() => navigator.clipboard.writeText(list.map((l) => `${time(l.time)} ${l.level} ${l.text}`).join('\n'))}>Copy</button>
        <button onClick={() => useStudio.setState({ logs: [] })}>Clear</button>
      </div>
      <div className="console-body" ref={body}>
        {list.map((l) => (
          <div
            key={l.id}
            className={'log ' + l.level + (l.ref && l.ref.kind !== 'asset' ? ' link' : '')}
            onClick={() => l.ref && l.ref.kind !== 'asset' && select([keyOf(l.ref)])}
          >
            <span className="log-time">{time(l.time)}</span>
            <span className="log-text">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
