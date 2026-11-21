/// <reference types="vite/client" />

declare module 'virtual:three-stage/project' {
  export const project: { name: string; dir: string };
}

/** Present only when opened in the app window (electron/preload.cjs) */
interface Window {
  threeStage?: { home(): Promise<unknown>; open(dir: string): Promise<{ ok?: unknown; error?: string }> };
}
