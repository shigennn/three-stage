'use client';
import { useImperativeHandle, useMemo, useState, type Ref } from 'react';
import { EventStore, StageView } from '@three-stage/runtime';
import type { SampleFrame } from './data';
import { registered } from './register';

// The component handed to the host app. Its types don't reference runtime types: the host app doesn't install the
// runtime package; the runtime is bundled inside this component.

/** Operations available through the ref. */
export interface SampleStageHandle {
  /** Plays an Event by name (the names are listed in manifest.json's `events`). `key` is the slot Key; omit it for Events without slots. */
  fire(name: string, key?: string): void;
}

/** Props of {@link SampleStage}. */
export interface SampleStageProps {
  /** URL of the published manifest.json. */
  bundle: string;
  /** One received data frame. Replace it when a new value arrives. */
  data: SampleFrame | null;
  className?: string;
  ref?: Ref<SampleStageHandle>;
}

void registered;

/** Renders the published Sample scene with the given data. */
export function SampleStage({ bundle, data, className, ref }: SampleStageProps) {
  const settings = useMemo(() => ({ quality: 'high' as const, resolution: 'auto' as const }), []);
  // Holds the fired Events, so it must not be recreated (useMemo may drop and recreate its value).
  const [events] = useState(() => new EventStore());
  useImperativeHandle(ref, () => ({ fire: (name, key) => events.fire(name, key) }), [events]);
  return <StageView bundle={bundle} data={data} receivedAt={data?.measuredAt ?? null} settings={settings} events={events} className={className} />;
}
