// Tenants — runtime state.
//
// Combines code-defined seeds (Acme Corp) with user-created additions in
// localStorage. Mounted once at app root in `main.tsx`. Workspaces and
// projects are scoped *under* a tenant — see `WorkspacesProvider` /
// `ProjectsProvider`.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { TENANTS, type Tenant } from '../fixtures';

const STORAGE_KEY = 'bira:tenants';

/** Fields the create-tenant form supplies. The provider fills the rest. */
export interface AddTenantInput {
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
}

export interface TenantsCtxValue {
  /** Seeded tenants + user-added tenants (in that order). */
  tenants: Tenant[];
  /** Lookup by slug. Returns undefined for unknown slugs. */
  getTenant: (slug: string) => Tenant | undefined;
  /** Append a new tenant. Returns the newly-created `Tenant`. */
  addTenant: (input: AddTenantInput) => Tenant;
}

const TenantsContext = createContext<TenantsCtxValue | undefined>(undefined);

function loadAdded(): Tenant[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Tenant =>
        t && typeof t.slug === 'string' && typeof t.name === 'string',
    );
  } catch {
    return [];
  }
}

export function TenantsProvider({ children }: { children: ReactNode }) {
  const [added, setAdded] = useState<Tenant[]>(() => loadAdded());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(added));
    } catch {
      // Quota / privacy mode — best-effort, ignore.
    }
  }, [added]);

  const tenants = useMemo(() => [...TENANTS, ...added], [added]);

  const getTenant = useCallback(
    (slug: string) => tenants.find((t) => t.slug === slug),
    [tenants],
  );

  const addTenant = useCallback((input: AddTenantInput): Tenant => {
    // Creator is admin of the new tenant by definition. Fresh tenants start
    // with 0 workspaces and just the creator as a member.
    const next: Tenant = {
      ...input,
      role: 'admin',
      workspaceCount: 0,
      memberCount: 1,
    };
    setAdded((prev) => [...prev, next]);
    return next;
  }, []);

  const value: TenantsCtxValue = { tenants, getTenant, addTenant };

  return <TenantsContext.Provider value={value}>{children}</TenantsContext.Provider>;
}

export function useTenants(): TenantsCtxValue {
  const ctx = useContext(TenantsContext);
  if (!ctx) throw new Error('useTenants must be used within TenantsProvider');
  return ctx;
}
