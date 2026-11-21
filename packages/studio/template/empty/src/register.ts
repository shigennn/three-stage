// Registrations included in the built package. Import your components (defineComponent) and 2D UI (defineOverlay) here.

// index.ts exports this so the package includes the registrations. A bare `import './register'` there would stay in
// the generated .d.ts and make the host app look for runtime types it doesn't have.
export const registered = true;
