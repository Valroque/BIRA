import { AppError } from '../../lib/errors.js';
import {
  generateTemporaryPassword,
  hashPassword,
} from '../../lib/passwordUtils.js';
import * as userService from '../../services/userService.js';
import * as membershipService from '../../services/membershipService.js';
import type { User } from '../../entities/User.js';

export interface AdminResetPasswordInput {
  actingUserId: string;
  tenantId: string;
  targetUserId: string;
}

export interface AdminResetPasswordResult {
  user: User;
  /**
   * The plaintext temporary password — returned EXACTLY ONCE so the admin
   * can hand it to the target user out-of-band. Never logged anywhere.
   */
  temporaryPassword: string;
}

/**
 * Tenant-admin-driven password reset. The server generates a temp password,
 * hashes it, persists it with `mustResetPassword: true`, and returns the
 * plaintext to the admin once. The flag is cleared ONLY by the user's own
 * change-password flow — re-logging in with the temp password does not
 * clear it. Until cleared, every `/api/tenants/...` request from that user
 * is blocked with HTTP 423.
 */
export async function adminResetPassword(
  input: AdminResetPasswordInput
): Promise<AdminResetPasswordResult> {
  if (input.actingUserId === input.targetUserId) {
    throw new AppError(
      'Use change-password to rotate your own password',
      400
    );
  }

  const tm = await membershipService.getTenantMembership(
    input.targetUserId,
    input.tenantId
  );
  if (!tm || tm.status !== 'active') {
    throw new AppError('User is not a member of this tenant', 404);
  }

  const existing = await userService.getById(input.targetUserId);
  if (!existing) throw new AppError('User is not a member of this tenant', 404);

  const temp = generateTemporaryPassword();
  const passwordHash = await hashPassword(temp);
  await userService.setPassword(input.targetUserId, passwordHash, {
    mustReset: true,
  });

  // Re-fetch to pick up the freshly-set flag and updated_at cleanly.
  const user = await userService.getById(input.targetUserId);
  if (!user) throw new AppError('User not found', 404);

  return { user, temporaryPassword: temp };
}
