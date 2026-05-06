import { AppError } from '../../lib/errors.js';
import { db } from '../../db/knex.js';
import * as userService from '../../services/userService.js';
import type { User } from '../../entities/User.js';

/**
 * Look up a user by id, scoped to a tenant. Used by the FE's UUID-fallback
 * path: when `useUsers()` encounters a uuid that isn't in the workspace
 * directory (e.g. the author of an old comment who has since left this
 * workspace), it queries this endpoint to resolve the display name.
 *
 * Tenant scoping prevents cross-tenant enumeration — a caller in tenant A
 * cannot use this endpoint to discover users in tenant B. The check is on
 * `tenant_memberships` regardless of `status` so deactivated / left-the-
 * tenant users still resolve, which keeps historical content readable.
 *
 * Returns 404 if the target was never a member of this tenant. The caller
 * (FE provider) caches the negative result so it doesn't re-query.
 */
export async function getTenantUserById(input: {
  tenantId: string;
  userId: string;
}): Promise<User> {
  const membership = await db('tenant_memberships')
    .where('tenant_id', input.tenantId)
    .where('user_id', input.userId)
    .first('id');
  if (!membership) throw new AppError('User not found in tenant', 404);

  const user = await userService.getById(input.userId);
  if (!user) throw new AppError('User not found', 404);
  return user;
}
