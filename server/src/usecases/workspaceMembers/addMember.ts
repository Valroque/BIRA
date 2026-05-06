import { AppError } from '../../lib/errors.js';
import * as membershipService from '../../services/membershipService.js';
import * as userService from '../../services/userService.js';
import type { Role } from '../../lib/constants.js';
import type { WorkspaceMemberView } from '../../services/membershipService.js';

export interface AddWorkspaceMemberInput {
  workspaceId: string;
  tenantId: string;
  userId: string;
  role: Role;
}

/**
 * Direct-add only. The target must already be an active tenant member;
 * otherwise we 400 (no separate `workspace_invites` table in v1 — see
 * `feedback`/CLAUDE.md). Adding a user who already has a workspace row
 * is a 409 (the FE should patch role, not re-add).
 *
 * Returns the hydrated member view so the FE can drop the row into its
 * directory list without a refetch.
 */
export async function addWorkspaceMember(
  input: AddWorkspaceMemberInput
): Promise<WorkspaceMemberView> {
  const user = await userService.getById(input.userId);
  if (!user) throw new AppError('User not found', 404);

  const tm = await membershipService.getTenantMembership(input.userId, input.tenantId);
  if (!tm || tm.status !== 'active') {
    throw new AppError('User is not an active member of this tenant', 400);
  }

  const existing = await membershipService.getWorkspaceMembership(
    input.userId,
    input.workspaceId
  );
  if (existing) {
    throw new AppError('User is already a member of this workspace', 409);
  }

  await membershipService.addWorkspaceMember({
    userId: input.userId,
    workspaceId: input.workspaceId,
    role: input.role,
    status: 'active',
  });

  const list = await membershipService.listWorkspaceMembers(input.workspaceId, input.tenantId);
  const view = list.find((m) => m.userId === input.userId);
  if (!view) throw new AppError('Failed to read back member', 500);
  return view;
}
