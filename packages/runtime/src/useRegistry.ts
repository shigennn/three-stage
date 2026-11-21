import { useSyncExternalStore } from 'react';
import { registry } from './registry';

let version = 0;
registry.subscribe(() => {
  version++;
});

/** Re-renders the calling component whenever anything is registered (for example, when hot reload replaces a definition). Returns a version number. */
export function useRegistry() {
  return useSyncExternalStore(registry.subscribe, () => version);
}
