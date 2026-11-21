'use client';
import { useImperativeHandle, useMemo, useState, type Ref } from 'react';
import { EventStore, StageView } from '@three-stage/runtime';
import type { Frame } from './data';
import { registered } from './register';

export interface FullStageHandle {
  fire(name: string, key?: string): void;
}

export interface FullStageProps {
  bundle: string;
  data: Frame | null;
  quality?: 'high' | 'low';
  resolution?: '1080p' | '720p' | 'auto';
  ref?: Ref<FullStageHandle>;
}

void registered;

export function FullStage({ bundle, data, quality = 'high', resolution = 'auto', ref }: FullStageProps) {
  const settings = useMemo(() => ({ quality, resolution }), [quality, resolution]);
  const [events] = useState(() => new EventStore());
  useImperativeHandle(ref, () => ({ fire: (n, k) => events.fire(n, k) }), [events]);
  return <StageView bundle={bundle} data={data} receivedAt={data?.measuredAt ?? null} settings={settings} events={events} />;
}
