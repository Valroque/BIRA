import { AppError } from '../../lib/errors.js';
import * as tenantService from '../../services/tenantService.js';
import type { Tenant } from '../../entities/Tenant.js';
import type { TenantStatus } from '../../lib/constants.js';

/**
 * Flip a tenant's status. Deactivate is a soft-freeze, not a delete — no
 * rows are removed; the tenant stops appearing in the default list and the
 * admin can reactivate it later. Idempotent — flipping to the current status
 * is a no-op that still returns the tenant.
 */
export async function setTenantStatus(
  tenantId: string,
  status: TenantStatus
): Promise<Tenant> {
  const updated = await tenantService.setStatus(tenantId, status);
  if (!updated) throw new AppError('Tenant not found', 404);
  return updated;
}
