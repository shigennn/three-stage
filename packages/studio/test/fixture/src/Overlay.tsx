import { useEffect } from 'react';
import { defineOverlay, useActivationRef, useFollowRef, useStageEnv, type OverlayProps } from '@three-stage/runtime';
import { probe } from './probe';

function Overlay(_: OverlayProps) {
  const env = useStageEnv();
  useEffect(() => {
    const f = new FontFace('Probe', `url(${env.url('fonts/Probe.ttf')})`);
    f.load().then((x) => { document.fonts.add(x); probe.font = 'loaded'; }, (e) => (probe.font = 'error ' + e));
  }, [env]);
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: 'Probe, sans-serif' }}>
      <div ref={useActivationRef('card')} data-part="card" style={{ position: 'absolute', left: 40, bottom: 40, fontSize: 48, background: '#fff', padding: 16 }}>CARD</div>
      <div ref={useActivationRef('alert')} data-part="alert" style={{ position: 'absolute', right: 40, top: 40, fontSize: 48, background: '#c00', color: '#fff', padding: 16 }}>ALERT</div>
      <div ref={useActivationRef('notice')} data-part="notice" style={{ position: 'absolute', left: 400, top: 40, fontSize: 48, background: '#000', color: '#fff', padding: 16 }}>NOTICE</div>
      <div ref={useFollowRef('LabelPoint')} data-part="label" style={{ position: 'absolute', left: 0, top: 0, fontSize: 32, background: '#ff0', padding: 8 }}>LABEL</div>
    </div>
  );
}

defineOverlay({ Component: Overlay, parts: ['card', 'alert', 'notice'] });
