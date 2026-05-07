// App shell — wraps a screen with the sidebar + main content area.
//
// **Sidebar collapse (2026-05-07)** — collapsed-state lives here as a
// useState hydrated from `localStorage` under `bira:sidebar-collapsed`
// (boolean, tenant-unaware — same scope rules as `bira:list-layout`).
// We pass a `onToggleCollapsed` callback down to the sidebar so the
// chevron button next to the BIRA brand can flip it. Persistence is a
// single useEffect that fires after every state change.
//
// The `sidebarCollapsed` prop is still accepted for the rare case a
// caller wants to force a particular state (e.g. a screenshot), but
// the default path is "user controls it via the in-sidebar toggle".

import { useEffect, useState, type ReactNode } from 'react';
import { Sidebar } from './shell';
import { CommandPalette } from './command-palette';

interface AppShellProps {
  children: ReactNode;
  sidebarCollapsed?: boolean;
  sidebarActive?: string;
}

const STORAGE_KEY = 'bira:sidebar-collapsed';

function loadCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return false;
    return raw === 'true';
  } catch {
    return false;
  }
}

export function AppShell({ children, sidebarCollapsed, sidebarActive }: AppShellProps) {
  // The prop, when provided, takes precedence over the user's saved
  // preference — handy for forcing collapsed in a controlled host.
  // When the prop is undefined we own the state ourselves and persist
  // it. Hydration is lazy (useState initialiser) so SSR-style
  // double-render in StrictMode doesn't double-read.
  const [collapsed, setCollapsed] = useState<boolean>(
    () => sidebarCollapsed ?? loadCollapsed(),
  );

  useEffect(() => {
    if (sidebarCollapsed !== undefined) return;
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? 'true' : 'false');
    } catch {
      // Quota / privacy mode — best-effort, mirrors useColumnLayout.
    }
  }, [collapsed, sidebarCollapsed]);

  // If the parent flips its controlled prop, mirror it into local
  // state so the toggle still reads correctly. (Pure overrides while
  // the prop is set; user can resume control once the parent unsets.)
  useEffect(() => {
    if (sidebarCollapsed !== undefined) setCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed]);

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', background: 'var(--bg)', overflow: 'hidden' }}>
      <Sidebar
        collapsed={collapsed}
        active={sidebarActive}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      <CommandPalette />
    </div>
  );
}
