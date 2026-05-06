import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import * as membershipService from '../../services/membershipService.js';

export interface RemoveWorkspaceMemberInput {
  workspaceId: string;
  tenantId: string;
  membershipId: string;
  /** id of the user calling the endpoint — used to allow self-leave. */
  actingUserId: string;
  /** Effective workspace role of the caller. Used to gate non-self removes. */
  actingRole: 'admin' | 'write' | 'read';
}

/**
 * Remove a workspace membership.
 *
 * Authorization is split between the route and this usecase: the route
 * resolves the workspace scope; this usecase decides whether the
 * specific (caller, target) combo is allowed:
 *   - Workspace admins can remove anyone (subject to last-admin guard).
 *   - Anyone can remove themselves (self-leave) — same guard applies.
 *   - Non-admins cannot remove other people.
 *
 * Last-admin guard mirrors `updateMemberRole`: removal is refused if
 * the target is the only effective workspace admin (counting tenant
 * admins as implicit admins).
 *
 * Cascades inside the same transaction:
 *   - `team_memberships` rows for this user in teams of this
 *     workspace (Domain B) — the user is no longer in the workspace, so
 *     they shouldn't keep team-derived role.
 *   - `project_user_access` rows for this user on projects of this
 *     workspace (Domain C).
 *
 * Files / comments / issues are left attached — historical attribution
 * survives even after a member leaves (mirrors user deactivation).
 */
export async function removeWorkspaceMember(
  input: RemoveWorkspaceMemberInput
): Promise<void> {
  return db.transaction(async (trx) => {
    const existing = await membershipService.getWorkspaceMembershipById(
      input.membershipId,
      trx
    );
    if (!existing || existing.workspaceId !== input.workspaceId) {
      throw new AppError('Workspace membership not found', 404);
    }

    const isSelf = existing.userId === input.actingUserId;
    if (!isSelf && input.actingRole !== 'admin') {
      throw new AppError(
        'Only workspace admins can remove other members',
        403
      );
    }

    if (existing.role === 'admin') {
      const remaining = await membershipService.countEffectiveWorkspaceAdmins(
        input.workspaceId,
        input.tenantId,
        existing.userId,
        trx
      );
      if (remaining === 0) {
        throw new AppError(
          'Cannot remove the last admin of this workspace — promote another member first',
          409
        );
      }
    }

    // Cascades — drop dependent rows in the same transaction.
    // Team memberships in teams of this workspace.
    await trx('team_memberships')
      .whereIn(
        'team_id',
        trx('teams').select('id').where('workspace_id', input.workspaceId)
      )
      .where('user_id', existing.userId)
      .delete();
    // Project user-access grants for projects of this workspace.
    await trx('project_user_access')
      .whereIn(
        'project_id',
        trx('projects').select('id').where('workspace_id', input.workspaceId)
      )
      .where('user_id', existing.userId)
      .delete();

    const ok = await membershipService.deleteWorkspaceMembership(
      input.membershipId,
      trx
    );
    if (!ok) throw new AppError('Failed to remove workspace membership', 500);
  });
}
