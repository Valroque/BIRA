// App shell — wraps a screen with the sidebar + main content area.
import type { ReactNode } from 'react';
import { Sidebar } from './shell';
import { CommandPalette } from './command-palette';

interface AppShellProps {
  children: ReactNode;
  sidebarCollapsed?: boolean;
  sidebarActive?: string;
}

export function AppShell({ children, sidebarCollapsed, sidebarActive }: AppShellProps) {
  return (
    <div className="bira" style={{ height: '100%', display: 'flex', background: 'var(--bg)', overflow: 'hidden' }}>
      <Sidebar collapsed={sidebarCollapsed} active={sidebarActive} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      <CommandPalette />
    </div>
  );
}
