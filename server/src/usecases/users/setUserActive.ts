import { AppError } from '../../lib/errors.js';
import * as userService from '../../services/userService.js';
import * as membershipService from '../../services/membershipService.js';
import type { User } from '../../entities/User.js';

export interface SetUserActiveInput {
  actingUserId: string;
  tenantId: string;
  targetUserId: string;
  isActive: boolean;
}

/**
 * Tenant-admin-driven user (de)activation. Mirrors `adminResetPassword`
 * — the acting admin must be in the same tenant as the target, can't
 * flip their own flag, and the target must have an active tenant
 * membership in this tenant.
 *
 * Deactivation is a global action on the user account: the user can't
 * log in to *any* tenant until reactivated. We still scope the gate to
 * tenant admins because BIRA has no system-level admin in v1; the
 * implicit rule is "if you can admin a tenant the user belongs to,
 * you can deactivate them."
 *
 * No data is destroyed. The user row stays; every FK referencing them
 * uses SET NULL or remains valid, so historical attribution survives.
 */
export async function setUserActive(input: SetUserActiveInput): Promise<User> {
  if (input.actingUserId === input.targetUserId) {
    throw new AppError(
      input.isActive
        ? 'You cannot reactivate your own account'
        : 'You cannot deactivate your own account',
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

  // Idempotent: flipping to the current state is a no-op that still
  // returns the user row.
  if (existing.isActive === input.isActive) return existing;

  // Workspace last-admin invariant (issue #20). Only matters on
  // deactivation. Under v1 "implicit OK" semantics — tenant admins
  // count as effective admins on every workspace — the API-reachable
  // surface for stranding a workspace is empty (the actor must already
  // be a tenant admin to call this endpoint, so at least one tenant
  // admin remains after deactivating someone else). The guard is
  // wired in anyway as defense-in-depth: it catches scenarios a future
  // surface (e.g. system-admin path) could reach, and keeps the
  // invariant uniform across user / role / member-removal paths.
  if (!input.isActive) {
    const stranded = await membershipService.findWorkspacesLeftAdminless(
      input.targetUserId,
      input.tenantId
    );
    if (stranded.length > 0) {
      const slugs = stranded.map((w) => w.slug).join(', ');
      throw new AppError(
        `Cannot deactivate this user — would leave the following workspaces without an admin: ${slugs}. Promote another admin first.`,
        409
      );
    }
  }

  const updated = await userService.setActive(input.targetUserId, input.isActive);
  if (!updated) throw new AppError('User not found', 404);
  return updated;
}
