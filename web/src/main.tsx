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
import { AuthProvider } from './state/auth';
import { TenantsProvider } from './state/tenants';

// `WorkspacesProvider` and `ProjectsProvider` are mounted inside the router
// (TenantLayout / WorkspaceLayout in App.tsx) so they can read URL params
// for their scope keys. `AuthProvider` wraps everything so any subtree can
// call useAuth(). `TenantsProvider` fetches from the API on mount and sits
// above the router since the tenant list isn't URL-derived.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <TenantsProvider>
        <App />
      </TenantsProvider>
    </AuthProvider>
  </StrictMode>,
);
