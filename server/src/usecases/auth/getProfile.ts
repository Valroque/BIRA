import { AppError } from '../../lib/errors.js';
import * as userService from '../../services/userService.js';
import * as tenantService from '../../services/tenantService.js';
import type { User } from '../../entities/User.js';
import type { Tenant } from '../../entities/Tenant.js';

export interface GetProfileResult {
  user: User;
  tenants: Tenant[];
}

export async function getProfile(userId: string): Promise<GetProfileResult> {
  const user = await userService.getById(userId);
  if (!user) throw new AppError('User not found', 404);

  const tenants = await tenantService.listForUser(userId);
  return { user, tenants };
}
