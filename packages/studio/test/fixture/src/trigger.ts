import { defineTrigger } from '@three-stage/runtime';
import type { Frame } from './data';

defineTrigger<{ level: number }>({
  type: 'test.levelReached',
  label: 'Level Reached',
  params: { level: { type: 'number', default: 70, min: 0, max: 100, label: 'Level' } },
  detect(prev, next, p) {
    return (prev as Frame).level < p.level && (next as Frame).level >= p.level ? [''] : [];
  },
});
