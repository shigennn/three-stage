import { createContext, useContext } from 'react';

/** Playback state. It changes every frame, so it is a mutable object rather than React state. */
export class Playback {
  /** Seconds since the start of the Timeline. Keeps increasing across loops instead of wrapping. */
  t = 0;
  /** Id of the camera currently shown, or null before the first frame. */
  cameraId: string | null = null;
  /** True while blending into the next camera. */
  blending = false;
  /** Whether the Timeline is advancing. */
  playing = false;
}

/** Provides the {@link Playback} of the current view. */
export const PlaybackContext = createContext<Playback>(new Playback());

/** Returns the {@link Playback} of the current view. Read it inside useFrame; it does not trigger re-renders. */
export function usePlayback() {
  return useContext(PlaybackContext);
}
