import * as tenantService from '../../services/tenantService.js';
import * as membershipService from '../../services/membershipService.js';
import type { Tenant } from '../../entities/Tenant.js';

export interface TenantListItem {
  tenant: Tenant;
  role: string;
}

export interface ListTenantsOptions {
  includeDeactivated?: boolean;
}

export async function listTenants(
  userId: string,
  opts: ListTenantsOptions = {}
): Promise<TenantListItem[]> {
  const tenants = await tenantService.listForUser(userId, opts);
  const out: TenantListItem[] = [];
  for (const tenant of tenants) {
    const tm = await membershipService.getTenantMembership(userId, tenant.id);
    if (tm) out.push({ tenant, role: tm.role });
  }
  return out;
}
