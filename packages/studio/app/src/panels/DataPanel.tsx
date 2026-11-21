import { useEffect, useState } from 'react';
import { registry, useRegistry } from '@three-stage/runtime';
import { log, useStudio } from '../store';
import { dataStore, fireReceive, setMinutes } from '../mock';
import { SelectField } from '../ui/fields';

// Data tab. The studio treats the project's defineMockData as opaque: it passes the time and kind and gets values back.

const SPEEDS = [0, 1, 10, 60, 300].map((v) => ({ value: String(v), label: `×${v}` }));

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

function Summary() {
  const def = registry.mock();
  const [text, setText] = useState('');
  useEffect(() => {
    const read = () => setText(def?.summary && dataStore.value ? def.summary(dataStore.value) : '');
    read();
    const off = dataStore.onReceive(read);
    const id = setInterval(read, 1000);
    return () => {
      off();
      clearInterval(id);
    };
  }, [def]);
  return text ? <span className="dim">{text}</span> : null;
}

export function DataPanel() {
  useRegistry();
  const mock = useStudio((s) => s.mock);
  const def = registry.mock();
  if (!def) return <div className="empty-note">No mock data registered</div>;
  return (
    <div className="data-panel">
      <div className="row">
        <span className="row-label">Time</span>
        <div className="row-value data-time">
          <span className="clock">{hhmm(mock.minutes)}</span>
          <input type="range" className="time" min={0} max={1439} step={1} value={Math.floor(mock.minutes)} onChange={(e) => setMinutes(Number(e.target.value))} />
        </div>
      </div>
      <SelectField
        label="Speed"
        value={String(mock.speed)}
        options={SPEEDS}
        onChange={(v) => useStudio.setState((s) => ({ mock: { ...s.mock, speed: Number(v) } }))}
      />
      {def.variants.length > 1 && (
        <SelectField
          label={def.variantLabel}
          value={mock.variant || def.variants[0].id}
          options={def.variants.map((v) => ({ value: v.id, label: v.label }))}
          onChange={(v) => useStudio.setState((s) => ({ mock: { ...s.mock, variant: v } }))}
        />
      )}
      <div className="row">
        <span className="row-label">Receive</span>
        <div className="row-value data-receive">
          <button
            onClick={() => {
              fireReceive();
              log('info', 'Received');
            }}
          >
            Receive Now
          </button>
          <Summary />
        </div>
      </div>
    </div>
  );
}
