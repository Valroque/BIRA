// Tenants — runtime state.
//
// Reads from the FE TENANTS fixture. The /tenants picker is anonymous (the
// user picks a tenant before logging in), so it can't go through the
// auth-gated GET /api/tenants. Tenants are seed-only in v1, so the fixture
// list and the BE seed must stay in sync by convention.

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { TENANTS, type Tenant } from '../fixtures';

export interface TenantsCtxValue {
  /** All known tenants (from the FE fixture). */
  tenants: Tenant[];
  /** Lookup by slug. Returns undefined for unknown slugs. */
  getTenant: (slug: string) => Tenant | undefined;
}

const TenantsContext = createContext<TenantsCtxValue | undefined>(undefined);

export function TenantsProvider({ children }: { children: ReactNode }) {
  const getTenant = useCallback(
    (slug: string) => TENANTS.find((t) => t.slug === slug),
    [],
  );

  const value: TenantsCtxValue = { tenants: TENANTS, getTenant };

  return <TenantsContext.Provider value={value}>{children}</TenantsContext.Provider>;
}

export function useTenants(): TenantsCtxValue {
  const ctx = useContext(TenantsContext);
  if (!ctx) throw new Error('useTenants must be used within TenantsProvider');
  return ctx;
}
