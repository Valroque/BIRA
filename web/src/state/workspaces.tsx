// Workspaces — runtime state, scoped per tenant.
//
// Fetches the workspace list from the API on mount. Mounted in `TenantLayout`
// (App.tsx) with `key={tenant}`, so navigating between tenants remounts it
// with the new tenant's data.

import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from 'react';
import type { Workspace } from '../fixtures';
import {
  listWorkspaces as apiListWorkspaces,
  createWorkspace as apiCreateWorkspace,
  updateWorkspace as apiUpdateWorkspace,
  archiveWorkspace as apiArchiveWorkspace,
  unarchiveWorkspace as apiUnarchiveWorkspace,
} from '../api/workspaces';

/** Fields the create-workspace form supplies. The provider fills the rest. */
export interface AddWorkspaceInput {
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
}

export interface WorkspacesCtxValue {
  /** Workspaces returned by the API for the active tenant. */
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
  /** Lookup by slug. Returns undefined for unknown slugs. */
  getWorkspace: (slug: string) => Workspace | undefined;
  /** Create a new workspace. Returns the newly-created Workspace. */
  addWorkspace: (input: AddWorkspaceInput) => Promise<Workspace>;
  /** Patch workspace name/letter/color/bg via the API. */
  updateWorkspace: (slug: string, patch: { name?: string; letter?: string; color?: string; bg?: string }) => Promise<void>;
  /** Archive or unarchive a workspace via the API. */
  setArchived: (slug: string, archived: boolean) => Promise<void>;
}

const WorkspacesContext = createContext<WorkspacesCtxValue | undefined>(undefined);

export function WorkspacesProvider({ tenant, children }: { tenant: string; children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant) { setLoading(false); return; }
    setLoading(true);
    apiListWorkspaces(tenant)
      .then((ws) => { setWorkspaces(ws); setError(null); })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load workspaces');
      })
      .finally(() => setLoading(false));
  }, [tenant]);

  const getWorkspace = useCallback(
    (slug: string) => workspaces.find((w) => w.slug === slug),
    [workspaces],
  );

  const addWorkspace = useCallback(async (input: AddWorkspaceInput): Promise<Workspace> => {
    const created = await apiCreateWorkspace(tenant, input);
    setWorkspaces((prev) => [...prev, created]);
    return created;
  }, [tenant]);

  const updateWorkspace = useCallback(async (
    slug: string,
    patch: { name?: string; letter?: string; color?: string; bg?: string },
  ): Promise<void> => {
    const updated = await apiUpdateWorkspace(tenant, slug, patch);
    setWorkspaces((prev) => prev.map((w) => (w.slug === slug ? { ...w, ...updated } : w)));
  }, [tenant]);

  const setArchived = useCallback(async (slug: string, archived: boolean): Promise<void> => {
    if (archived) {
      await apiArchiveWorkspace(tenant, slug);
    } else {
      await apiUnarchiveWorkspace(tenant, slug);
    }
    setWorkspaces((prev) =>
      prev.map((w) => (w.slug === slug ? { ...w, archived } : w)),
    );
  }, [tenant]);

  const value: WorkspacesCtxValue = {
    workspaces, loading, error, getWorkspace, addWorkspace, updateWorkspace, setArchived,
  };

  return <WorkspacesContext.Provider value={value}>{children}</WorkspacesContext.Provider>;
}

export function useWorkspaces(): WorkspacesCtxValue {
  const ctx = useContext(WorkspacesContext);
  if (!ctx) throw new Error('useWorkspaces must be used within WorkspacesProvider');
  return ctx;
}
