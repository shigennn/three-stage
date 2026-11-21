import { DataStore, registry, todayAt } from '@three-stage/runtime';
import { useStudio } from './store';

// Clock for the project's mock data. In Edit and while paused it holds the stopped time; in Play it advances at the Data tab's speed.

export const dataStore = new DataStore();

// Hot-reloading would create a new dataStore disconnected from the running loop, so reload the whole page
import.meta.hot?.accept(() => location.reload());

let minutes = useStudio.getState().mock.minutes;
let lastUi = 0;

function sample(silent: boolean) {
  const mock = registry.mock();
  if (!mock) return;
  const { variant } = useStudio.getState().mock;
  const v = variant || mock.variants[0]?.id || '';
  const r = mock.sample(minutes, v);
  dataStore.set(r.value, todayAt(r.receivedAt), silent);
}

export function setMinutes(m: number) {
  minutes = ((m % 1440) + 1440) % 1440;
  useStudio.setState((s) => ({ mock: { ...s.mock, minutes } }));
  sample(true);
}

export function startMockLoop() {
  let last = performance.now();
  const loop = (t: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.25, (t - last) / 1000);
    last = t;
    const s = useStudio.getState();
    if (s.mode === 'play' && !s.paused && s.mock.speed > 0) {
      minutes = (minutes + (dt * s.mock.speed) / 60) % 1440;
      sample(false);
      if (t - lastUi > 250) {
        lastUi = t;
        useStudio.setState((st) => ({ mock: { ...st.mock, minutes } }));
      }
    }
  };
  requestAnimationFrame(loop);
  registry.subscribe(() => sample(true));
  useStudio.subscribe((s, prev) => {
    if (s.mock.variant !== prev.mock.variant) sample(true);
  });
  sample(true);
}

export function fireReceive() {
  dataStore.fire();
}
