// Workspaces — runtime state.
//
// Combines code-defined seed workspaces (Acme/Nimbus/Polar) with user-created
// additions persisted to localStorage. The post-login picker reads from here,
// and the sidebar uses it to show the active workspace's display name.
//
// Note (prototype scope): projects, issues, and members are NOT yet scoped
// per workspace — every workspace renders the same Acme fixture data once you
// enter it. Workspace-scoped state is a follow-up; for now this provider only
// owns the workspace list itself.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { WORKSPACES, type Workspace } from '../fixtures';

const STORAGE_KEY = 'bira:workspaces';

/** Fields the create-workspace form supplies. The provider fills the rest. */
export interface AddWorkspaceInput {
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
}

export interface WorkspacesCtxValue {
  /** Seeded workspaces + user-added workspaces (in that order). */
  workspaces: Workspace[];
  /** Lookup by slug. Returns undefined for unknown slugs. */
  getWorkspace: (slug: string) => Workspace | undefined;
  /** Append a new workspace. Returns the newly-created `Workspace`. */
  addWorkspace: (input: AddWorkspaceInput) => Workspace;
}

const WorkspacesContext = createContext<WorkspacesCtxValue | undefined>(undefined);

function loadAdded(): Workspace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (w): w is Workspace =>
        w && typeof w.slug === 'string' && typeof w.name === 'string',
    );
  } catch {
    return [];
  }
}

export function WorkspacesProvider({ children }: { children: ReactNode }) {
  const [added, setAdded] = useState<Workspace[]>(() => loadAdded());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(added));
    } catch {
      // Quota / privacy mode — best-effort, ignore.
    }
  }, [added]);

  const workspaces = useMemo(() => [...WORKSPACES, ...added], [added]);

  const getWorkspace = useCallback(
    (slug: string) => workspaces.find((w) => w.slug === slug),
    [workspaces],
  );

  const addWorkspace = useCallback((input: AddWorkspaceInput): Workspace => {
    // Creator is admin of the new workspace by definition. Fresh workspaces
    // start with 0 projects and just the creator as a member.
    const next: Workspace = {
      ...input,
      role: 'admin',
      projectCount: 0,
      memberCount: 1,
    };
    setAdded((prev) => [...prev, next]);
    return next;
  }, []);

  const value: WorkspacesCtxValue = { workspaces, getWorkspace, addWorkspace };

  return <WorkspacesContext.Provider value={value}>{children}</WorkspacesContext.Provider>;
}

export function useWorkspaces(): WorkspacesCtxValue {
  const ctx = useContext(WorkspacesContext);
  if (!ctx) throw new Error('useWorkspaces must be used within WorkspacesProvider');
  return ctx;
}
