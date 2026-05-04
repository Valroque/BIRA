// Tenant API. Tenant creation is intentionally not exposed — for v1,
// tenants are provisioned out of band (DB seed). The BE endpoint exists
// (POST /api/tenants) but the FE doesn't surface it.

import { apiFetch } from './client';
import { adaptTenantListItem, type RawTenant } from './adapters/tenant.adapter';
import type { Tenant } from '../fixtures';

export async function listTenants(): Promise<Tenant[]> {
  const items = await apiFetch<Array<{ tenant: RawTenant; role: string }>>('/api/tenants');
  return items.map(adaptTenantListItem);
}
