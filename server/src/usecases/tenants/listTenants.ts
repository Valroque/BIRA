import * as tenantService from '../../services/tenantService.js';
import type { Tenant } from '../../entities/Tenant.js';

/**
 * All active tenants, returned to the public picker. The endpoint is
 * unauthenticated — there is no caller context, so no role is included.
 * Deactivated tenants are excluded.
 */
export async function listTenants(): Promise<Tenant[]> {
  return tenantService.listAllActive();
}
