// Values run.mjs reads from the page as window.__probe.
export const probe: Record<string, any> = ((globalThis as any).__probe ??= {});
