import { setPlaying, useStudio } from '../store';
import { viewport } from './refs';

// Fullscreen preview of the Play Viewport (stage and 2D UI only), as it will look embedded in the host app.
// Uses requestFullscreen, so it also works in a browser on a server started with --no-open.
// Only Esc exits, handled by the browser; studio keys are ignored meanwhile (keys.ts). Stats can't be toggled and keep their previous visibility.

export const isFullscreen = () => !!viewport.area && document.fullscreenElement === viewport.area;

/** Also starts Play when in Edit. Call from a key or click handler (browsers only allow fullscreen in response to user input) */
export function enterFullscreen() {
  const s = useStudio.getState();
  if (!viewport.area || !s.scene || isFullscreen()) return;
  if (s.mode === 'edit') setPlaying(true);
  viewport.area.requestFullscreen().catch(() => {});
}

// If the mode returns to Edit while in fullscreen (e.g. when the Scene is reopened), exit fullscreen too. The Edit Viewport is never used in fullscreen
useStudio.subscribe((s, prev) => {
  if (s.mode === 'edit' && prev.mode !== 'edit' && isFullscreen()) void document.exitFullscreen();
});
