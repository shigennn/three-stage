import { createRoot } from 'react-dom/client';
import 'virtual:three-stage/project';
import { Studio } from './Studio';
import { useStudio } from './store';
import './styles.css';

// Lets headless Chrome (tools/cdp.mjs) read the state
(window as any).__studio = useStudio;

createRoot(document.getElementById('root')!).render(<Studio />);
