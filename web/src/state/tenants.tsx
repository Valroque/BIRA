// Tenants — runtime state.
//
// Loads from the public `GET /api/tenants` endpoint at app boot. The picker
// runs before login, so the endpoint is unauthenticated and returns plain
// tenant rows (no per-user role).

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { listTenants } from '../api/tenants';
import { ApiError } from '../api/client';
import type { Tenant } from '../fixtures';

export interface TenantsCtxValue {
  /** All active tenants from the API. */
  tenants: Tenant[];
  /** True only during the initial fetch. */
  loading: boolean;
  /** Human-readable error message, or null. */
  error: string | null;
  /** Lookup by slug. Returns undefined for unknown slugs. */
  getTenant: (slug: string) => Tenant | undefined;
  /** Refetch the list (e.g. after a "retry" click). */
  refresh: () => Promise<void>;
}

const TenantsContext = createContext<TenantsCtxValue | undefined>(undefined);

export function TenantsProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const items = await listTenants();
      setTenants(items);
    } catch (err) {
      setTenants([]);
      const msg =
        err instanceof ApiError ? err.message :
        err instanceof Error ? err.message :
        'Failed to load tenants';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getTenant = useCallback(
    (slug: string) => tenants.find((t) => t.slug === slug),
    [tenants],
  );

  const value: TenantsCtxValue = { tenants, loading, error, getTenant, refresh };

  return <TenantsContext.Provider value={value}>{children}</TenantsContext.Provider>;
}

export function useTenants(): TenantsCtxValue {
  const ctx = useContext(TenantsContext);
  if (!ctx) throw new Error('useTenants must be used within TenantsProvider');
  return ctx;
}
