// Tenant API. The list endpoint is public (pre-login picker).
// Tenant creation is intentionally not exposed in v1 — tenants are
// provisioned out of band. The BE endpoint exists (POST /api/tenants)
// but the FE doesn't surface it.

import { apiFetch } from './client';
import { adaptTenant, type RawTenant } from './adapters/tenant.adapter';
import type { Tenant } from '../fixtures';

export async function listTenants(): Promise<Tenant[]> {
  // Endpoint is public; apiFetch's bearer attach is harmless when present.
  const items = await apiFetch<RawTenant[]>('/api/tenants');
  return items.map(adaptTenant);
}

export interface UpdateTenantPatch {
  name?: string;
  letter?: string;
  color?: string;
  bg?: string;
}

export async function updateTenant(slug: string, patch: UpdateTenantPatch): Promise<Tenant> {
  const raw = await apiFetch<RawTenant>(`/api/tenants/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return adaptTenant(raw);
}
