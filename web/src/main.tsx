import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

// Dev-only component sheet at /#kit (CLAUDE.md H1). `import.meta.env.DEV` is
// false in production builds, so the Kit chunk is never shipped.
const Kit = import.meta.env.DEV ? lazy(() => import('./dev/Kit')) : null;
const showKit = Kit !== null && window.location.hash === '#kit';

createRoot(container).render(
  <StrictMode>
    {showKit && Kit ? (
      <Suspense fallback={null}>
        <Kit />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
