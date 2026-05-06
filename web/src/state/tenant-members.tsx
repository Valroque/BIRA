// Tenant members — runtime state, scoped per tenant.
//
// Mounted in `TenantLayout` (App.tsx) with `key={tenant}`, so navigating
// between tenants reloads the directory cleanly. Open to any tenant
// member; mutations (invite / role change / remove) aren't wired yet —
// see GitHub issue tracking the rest of the migration.

import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from 'react';
import { listTenantMembers as apiListTenantMembers } from '../api/tenantMembers';
import type { TenantMember } from '../api/adapters/tenantMember.adapter';

export interface TenantMembersCtxValue {
  members: TenantMember[];
  loading: boolean;
  error: string | null;
  /** Lookup by membershipId. */
  getMember: (membershipId: string) => TenantMember | undefined;
  /** Lookup by userId. */
  getMemberByUserId: (userId: string | null | undefined) => TenantMember | undefined;
  /** Re-fetch the directory. Does not toggle `loading`. */
  refresh: () => Promise<void>;
}

const TenantMembersContext = createContext<TenantMembersCtxValue | undefined>(undefined);

export function TenantMembersProvider({
  tenant, children,
}: {
  tenant: string; children: ReactNode;
}) {
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (toggleLoading: boolean) => {
    if (!tenant) {
      if (toggleLoading) setLoading(false);
      return;
    }
    if (toggleLoading) setLoading(true);
    try {
      const items = await apiListTenantMembers(tenant);
      setMembers(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tenant members');
    } finally {
      if (toggleLoading) setLoading(false);
    }
  }, [tenant]);

  useEffect(() => { void load(true); }, [load]);

  const getMember = useCallback(
    (membershipId: string) => members.find((m) => m.membershipId === membershipId),
    [members],
  );

  const getMemberByUserId = useCallback(
    (userId: string | null | undefined) => {
      if (!userId) return undefined;
      return members.find((m) => m.userId === userId);
    },
    [members],
  );

  const refresh = useCallback(() => load(false), [load]);

  const value: TenantMembersCtxValue = {
    members, loading, error,
    getMember, getMemberByUserId, refresh,
  };

  return (
    <TenantMembersContext.Provider value={value}>
      {children}
    </TenantMembersContext.Provider>
  );
}

export function useTenantMembers(): TenantMembersCtxValue {
  const ctx = useContext(TenantMembersContext);
  if (!ctx) throw new Error('useTenantMembers must be used within TenantMembersProvider');
  return ctx;
}
