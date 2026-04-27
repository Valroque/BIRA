import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Geist Sans + Mono (self-hosted via @fontsource for offline / self-host friendliness)
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import '@fontsource/geist-mono/600.css';
import '@fontsource/geist-mono/700.css';

import './index.css';
import App from './App';
import { WorkspacesProvider } from './state/workspaces';

// `ProjectsProvider` is mounted per-workspace inside `WorkspaceLayout`
// (see App.tsx) — it needs the URL `:workspace` slug to scope storage,
// which isn't available above the router.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkspacesProvider>
      <App />
    </WorkspacesProvider>
  </StrictMode>,
);
