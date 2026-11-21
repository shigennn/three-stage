import { useState } from 'react';
import type { Draft } from 'immer';
import { stageSize, type QualityDef, type StageSceneDef } from '@three-stage/runtime';
import { edit, useStudio } from '../store';
import { NumberInput, NumberField, Row, Section, SelectField, sceneSetter } from '../ui/fields';

// Render Settings dialog: aspect ratio, quality levels and Dynamic Resolution, saved in the scene. The exported component renders with the same settings.

const HEIGHTS = [1080, 720, 540];
const SHADOW = [
  { value: '1', label: '100%' },
  { value: '0.5', label: '50%' },
  { value: '0.25', label: '25%' },
];

type Page = 'output' | 'quality' | 'dynamic';

function heights(scene: StageSceneDef, list: number[]) {
  const [w, h] = scene.render.aspectRatio;
  return list.map((n) => ({ value: String(n), label: `${Math.round((n * w) / h)} × ${n}` }));
}

function QualityPage({ scene }: { scene: StageSceneDef }) {
  const [level, setLevel] = useState<'high' | 'low'>('high');
  const q = scene.render.quality[level];
  const set = (f: (x: Draft<QualityDef>) => void) => edit((d) => f(d.render.quality[level]));
  return (
    <>
      <div className="seg settings-levels">
        {(['high', 'low'] as const).map((l) => (
          <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
            {l === 'high' ? 'High' : 'Low'}
          </button>
        ))}
      </div>
      <Section title={level === 'high' ? 'High' : 'Low'}>
        <SelectField label="Max Resolution" value={String(q.maxHeight)} options={heights(scene, HEIGHTS)} onChange={(v) => set((x) => void (x.maxHeight = Number(v)))} />
        <SelectField label="Shadow Map Scale" value={String(q.shadowMapScale)} options={SHADOW} onChange={(v) => set((x) => void (x.shadowMapScale = Number(v)))} />
      </Section>
    </>
  );
}

function DynamicPage({ scene }: { scene: StageSceneDef }) {
  const a = scene.render.dynamicResolution;
  return (
    <Section title="Dynamic Resolution">
      <SelectField
        label="Minimum Resolution"
        value={String(a.minHeight)}
        options={heights(scene, HEIGHTS.slice(1))}
        onChange={(v) => edit((d) => void (d.render.dynamicResolution.minHeight = Number(v)))}
      />
      <NumberField
        label="Frame Time Threshold"
        value={a.frameTimeThreshold}
        onChange={sceneSetter<number>((d, v) => void (d.render.dynamicResolution.frameTimeThreshold = v), 'render:frameTime')}
        step={1}
        min={20}
        max={200}
        unit="ms"
      />
    </Section>
  );
}

function OutputPage({ scene }: { scene: StageSceneDef }) {
  const [w, h] = scene.render.aspectRatio;
  const size = stageSize(scene.render.aspectRatio);
  const setAspect = (i: 0 | 1) => sceneSetter<number>((d, v) => void (d.render.aspectRatio[i] = Math.max(1, Math.round(v))), `render:aspect:${i}`);
  return (
    <Section title="Output">
      <Row label="Aspect Ratio">
        <div className="aspect-row">
          <NumberInput value={w} onChange={setAspect(0)} step={1} min={1} max={64} precision={0} width={64} />
          <span>:</span>
          <NumberInput value={h} onChange={setAspect(1)} step={1} min={1} max={64} precision={0} width={64} />
        </div>
      </Row>
      <Row label="Resolution">
        {size.width} × {size.height}
      </Row>
      <Row label="Frame Rate">30 fps</Row>
    </Section>
  );
}

export function RenderSettings() {
  const open = useStudio((s) => s.renderSettingsOpen);
  const scene = useStudio((s) => s.scene);
  const [page, setPage] = useState<Page>('output');
  if (!open || !scene) return null;
  const close = () => useStudio.setState({ renderSettingsOpen: false });
  return (
    <div className="dialog-back" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog settings">
        <div className="panel-head">
          <span className="panel-title">Render Settings</span>
          <div className="spacer" />
          <button className="icon-btn on" onClick={close} title="Close">
            ✕
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-nav">
            {(
              [
                ['output', 'Output'],
                ['quality', 'Quality'],
                ['dynamic', 'Dynamic Resolution'],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className={'item' + (page === k ? ' selected' : '')} onClick={() => setPage(k)}>
                {label}
              </div>
            ))}
          </div>
          <div className="settings-page">{page === 'output' ? <OutputPage scene={scene} /> : page === 'quality' ? <QualityPage scene={scene} /> : <DynamicPage scene={scene} />}</div>
        </div>
      </div>
    </div>
  );
}
