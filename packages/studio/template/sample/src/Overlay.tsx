import { useEffect, useState } from 'react';
import { defineOverlay, useActivationRef, type OverlayProps } from '@three-stage/runtime';
import { levelLabel, type SampleFrame } from './data';

// Sample of a 2D UI, drawn on a stage 1080 px high.
// `summary` is shown by the Timeline's Activation Track. `notice` has a Track only in the Event Timeline `notice`,
// so it appears only when that Event plays.
// React state is fine here because the value changes only when data arrives; per-frame updates belong in refs.

const PARTS = ['summary', 'notice'];

function useFrameData(data: OverlayProps['data']) {
  const [frame, setFrame] = useState(data.value as SampleFrame | null);
  useEffect(() => {
    const read = () => setFrame(data.value as SampleFrame | null);
    const off = data.onReceive(read);
    // Moving the time in the studio doesn't call onReceive (it isn't a receive), so also re-read on an interval.
    const id = setInterval(read, 1000);
    return () => {
      off();
      clearInterval(id);
    };
  }, [data]);
  return frame;
}

function Overlay({ data }: OverlayProps) {
  const frame = useFrameData(data);
  return (
    <div style={S.root}>
      <div ref={useActivationRef('notice')} style={S.notice}>
        This message is shown by an Event
      </div>
      <div ref={useActivationRef('summary')} style={S.card}>
        <div style={S.label}>Level</div>
        <div style={S.row}>
          <span style={S.value}>{frame?.level ?? '–'}</span>
          <span style={S.unit}>/ 100</span>
          {frame && <span style={S.status}>{levelLabel(frame.level)}</span>}
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: { position: 'absolute', inset: 0, fontFamily: 'system-ui, sans-serif', color: '#101828' },
  card: { position: 'absolute', left: 64, bottom: 48, background: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: '20px 32px', minWidth: 360 },
  label: { fontSize: 28, color: '#475467', marginBottom: 12 },
  row: { display: 'flex', alignItems: 'baseline', gap: 12 },
  value: { fontSize: 88, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' },
  unit: { fontSize: 32, color: '#475467' },
  status: { marginLeft: 'auto', paddingLeft: 32, fontSize: 36, fontWeight: 700 },
  notice: { position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)', background: '#101828', color: '#FFFFFF', borderRadius: 20, padding: '20px 40px', fontSize: 36, fontWeight: 700, whiteSpace: 'nowrap' },
};

defineOverlay({ Component: Overlay, parts: PARTS });
