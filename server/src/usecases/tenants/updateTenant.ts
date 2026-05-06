import { AppError } from '../../lib/errors.js';
import * as tenantService from '../../services/tenantService.js';
import type { Tenant } from '../../entities/Tenant.js';

export interface UpdateTenantInput {
  tenantId: string;
  patch: {
    name?: string;
    letter?: string;
    color?: string;
    bg?: string;
  };
}

export async function updateTenant(input: UpdateTenantInput): Promise<Tenant> {
  const tenant = await tenantService.update(input.tenantId, input.patch);
  if (!tenant) throw new AppError('Tenant not found', 404);
  return tenant;
}
