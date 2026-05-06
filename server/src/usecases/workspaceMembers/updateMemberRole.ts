import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import * as membershipService from '../../services/membershipService.js';
import type { Role } from '../../lib/constants.js';
import type { WorkspaceMemberView } from '../../services/membershipService.js';

export interface UpdateWorkspaceMemberRoleInput {
  workspaceId: string;
  tenantId: string;
  membershipId: string;
  role: Role;
}

/**
 * Patch a workspace membership's role.
 *
 * Last-admin guard: refuse a demotion that would leave the workspace
 * with zero effective admins. Effective admins include explicit
 * workspace admins AND active tenant admins (tenant admins resolve to
 * workspace `admin` via the tenant-admin-wins rule). The check happens
 * inside the same transaction as the update so two concurrent
 * demotions can't both squeeze through.
 */
export async function updateWorkspaceMemberRole(
  input: UpdateWorkspaceMemberRoleInput
): Promise<WorkspaceMemberView> {
  // Mutations + guard happen inside a transaction so two concurrent
  // demotions can't both pass the last-admin check. The hydrated read
  // view runs OUTSIDE the transaction (after commit) so the join sees
  // the new role — knex transactions don't always reuse the same
  // connection for follow-on `db.*` queries.
  await db.transaction(async (trx) => {
    const existing = await membershipService.getWorkspaceMembershipById(
      input.membershipId,
      trx
    );
    if (!existing || existing.workspaceId !== input.workspaceId) {
      throw new AppError('Workspace membership not found', 404);
    }

    if (existing.role === input.role) return;

    // Demotion away from admin → enforce last-admin guard. The count
    // EXCLUDES the target user; if zero remain, reject.
    if (existing.role === 'admin' && input.role !== 'admin') {
      const remaining = await membershipService.countEffectiveWorkspaceAdmins(
        input.workspaceId,
        input.tenantId,
        existing.userId,
        trx
      );
      if (remaining === 0) {
        throw new AppError(
          'Cannot demote the last admin of this workspace — promote another member first',
          409
        );
      }
    }

    const updated = await membershipService.updateWorkspaceMembershipRole(
      input.membershipId,
      input.role,
      trx
    );
    if (!updated) throw new AppError('Failed to update workspace membership', 500);
  });

  const list = await membershipService.listWorkspaceMembers(
    input.workspaceId,
    input.tenantId
  );
  const view = list.find((m) => m.membershipId === input.membershipId);
  if (!view) throw new AppError('Failed to read back member', 500);
  return view;
}
