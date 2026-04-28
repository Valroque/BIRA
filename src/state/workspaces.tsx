// Workspaces — runtime state, scoped per tenant.
//
// Mounted in `TenantLayout` (App.tsx) with `key={tenant}`, so navigating
// between tenants remounts it with the new tenant's storage key + seed.
// Seeds are code-defined `WORKSPACES` filtered by tenant; user-created
// additions persist under `bira:workspaces:<tenant>`. The old global
// `bira:workspaces` key is abandoned (no migration code in Phase 0 — it
// becomes an orphan).
//
// Note (prototype scope): projects, issues, and members are NOT yet scoped
// per workspace beyond the project list itself. Membership reshape is a
// later phase.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { WORKSPACES, type Workspace } from '../fixtures';

const storageKey = (tenant: string) => `bira:workspaces:${tenant}`;

/** Fields the create-workspace form supplies. The provider fills the rest. */
export interface AddWorkspaceInput {
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
}

export interface WorkspacesCtxValue {
  /** Seeded workspaces + user-added workspaces (in that order), all scoped to the active tenant. */
  workspaces: Workspace[];
  /** Lookup by slug. Returns undefined for unknown slugs. */
  getWorkspace: (slug: string) => Workspace | undefined;
  /** Append a new workspace under the active tenant. Returns the newly-created `Workspace`. */
  addWorkspace: (input: AddWorkspaceInput) => Workspace;
}

const WorkspacesContext = createContext<WorkspacesCtxValue | undefined>(undefined);

const seedFor = (tenant: string): Workspace[] =>
  WORKSPACES.filter((w) => w.tenantSlug === tenant);

function loadAdded(tenant: string): Workspace[] {
  try {
    const raw = localStorage.getItem(storageKey(tenant));
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

export function WorkspacesProvider({ tenant, children }: { tenant: string; children: ReactNode }) {
  const [added, setAdded] = useState<Workspace[]>(() => loadAdded(tenant));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(tenant), JSON.stringify(added));
    } catch {
      // Quota / privacy mode — best-effort, ignore.
    }
  }, [tenant, added]);

  const workspaces = useMemo(() => [...seedFor(tenant), ...added], [tenant, added]);

  const getWorkspace = useCallback(
    (slug: string) => workspaces.find((w) => w.slug === slug),
    [workspaces],
  );

  const addWorkspace = useCallback((input: AddWorkspaceInput): Workspace => {
    // Creator is admin of the new workspace by definition. Fresh workspaces
    // start with 0 projects and just the creator as a member. `tenantSlug`
    // is stamped from the provider's `tenant` prop — callers don't pass it.
    const next: Workspace = {
      ...input,
      tenantSlug: tenant,
      role: 'admin',
      projectCount: 0,
      memberCount: 1,
    };
    setAdded((prev) => [...prev, next]);
    return next;
  }, [tenant]);

  const value: WorkspacesCtxValue = { workspaces, getWorkspace, addWorkspace };

  return <WorkspacesContext.Provider value={value}>{children}</WorkspacesContext.Provider>;
}

export function useWorkspaces(): WorkspacesCtxValue {
  const ctx = useContext(WorkspacesContext);
  if (!ctx) throw new Error('useWorkspaces must be used within WorkspacesProvider');
  return ctx;
}
