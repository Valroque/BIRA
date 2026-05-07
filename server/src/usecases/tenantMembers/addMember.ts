import { AppError } from '../../lib/errors.js';
import * as membershipService from '../../services/membershipService.js';
import * as userService from '../../services/userService.js';
import type { Role } from '../../lib/constants.js';
import type { TenantMemberView } from '../../services/membershipService.js';

export interface AddTenantMemberInput {
  tenantId: string;
  userId: string;
  role: Role;
}

/**
 * Add a tenant membership for an existing user.
 *
 * Per the issue brief:
 *   - 404 if the user does not exist (admin can't pull a stranger in
 *     without first creating their account — that's a separate flow).
 *   - Idempotent on already-active member: if a row already exists with
 *     `status='active'`, return it as-is. Role changes go through PATCH.
 *   - Re-activates rows that exist in `invited` / `deactivated` state and
 *     stamps the requested role on them — same row, no fresh insert.
 *
 * Returns the hydrated member view via `listTenantMembers`, so the FE can
 * drop the row into its directory list without a refetch.
 */
export async function addTenantMember(
  input: AddTenantMemberInput
): Promise<TenantMemberView> {
  const user = await userService.getById(input.userId);
  if (!user) throw new AppError('User not found', 404);

  const existing = await membershipService.getTenantMembership(
    input.userId,
    input.tenantId
  );

  if (!existing) {
    await membershipService.addTenantMember({
      userId: input.userId,
      tenantId: input.tenantId,
      role: input.role,
      status: 'active',
    });
  } else if (existing.status !== 'active') {
    await membershipService.updateTenantMembership(existing.id, {
      role: input.role,
      status: 'active',
    });
  }
  // existing && existing.status === 'active' → idempotent no-op.

  const list = await membershipService.listTenantMembers(input.tenantId);
  const view = list.find((m) => m.userId === input.userId);
  if (!view) throw new AppError('Failed to read back tenant member', 500);
  return view;
}
