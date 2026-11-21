// Registrations included in the exported package. Mock data is not; src/stage.ts adds it for the studio.
import './components/Balls';
import './components/Accent';
import './components/SkyBlend';
import './Overlay';
import './shaders/Grid';
import './effects/Tint';

// SampleStage reads this value so that the registrations above are always bundled.
// A bare `import './register'` would stay in the generated .d.ts and point the host app at runtime types it doesn't have.
export const registered = true;
