import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import * as membershipService from '../../services/membershipService.js';

export interface RemoveTenantMemberInput {
  tenantId: string;
  /** id of the user being removed (target). */
  userId: string;
  /** id of the user calling the endpoint — used to allow self-leave. */
  actingUserId: string;
  /** Effective tenant role of the caller. Used to gate non-self removes. */
  actingRole: 'admin' | 'write' | 'read';
}

/**
 * Remove a tenant membership.
 *
 * Authorization is split between the route and this usecase: the route
 * resolves the tenant scope; this usecase decides whether the specific
 * (caller, target) combo is allowed:
 *   - Tenant admins can remove anyone (subject to last-admin guard).
 *   - Anyone can remove themselves (self-leave) — same guard applies.
 *   - Non-admins cannot remove other people.
 *
 * Last-admin guard mirrors `updateTenantMemberRole`: removal is refused
 * if the target is the only active tenant admin.
 *
 * Cascades inside the same transaction (tenant membership is the
 * outermost RBAC anchor — once it's gone, every dependent grant has to
 * go too):
 *   - `workspace_memberships` for this user across all workspaces in
 *     this tenant.
 *   - `team_memberships` for this user across all teams in workspaces
 *     in this tenant.
 *   - `project_user_access` rows for this user across all projects in
 *     workspaces in this tenant.
 *
 * Files / comments / issues are left attached — historical attribution
 * survives even after a member leaves (mirrors workspace-member removal
 * and user deactivation).
 */
export async function removeTenantMember(
  input: RemoveTenantMemberInput
): Promise<void> {
  return db.transaction(async (trx) => {
    const existing = await membershipService.getTenantMembership(
      input.userId,
      input.tenantId
    );
    if (!existing) throw new AppError('Tenant membership not found', 404);

    const isSelf = existing.userId === input.actingUserId;
    if (!isSelf && input.actingRole !== 'admin') {
      throw new AppError(
        'Only tenant admins can remove other members',
        403
      );
    }

    if (existing.role === 'admin' && existing.status === 'active') {
      const remaining = await membershipService.countActiveTenantAdmins(
        input.tenantId,
        existing.userId,
        trx
      );
      if (remaining === 0) {
        throw new AppError(
          'Cannot remove the last admin of this tenant — promote another member first',
          409
        );
      }
    }

    // Cascades — tenant membership is the outermost grant; everything
    // dependent on it has to go in the same transaction.
    // Workspace memberships in workspaces of this tenant.
    await trx('workspace_memberships')
      .whereIn(
        'workspace_id',
        trx('workspaces').select('id').where('tenant_id', input.tenantId)
      )
      .where('user_id', existing.userId)
      .delete();
    // Team memberships in teams of workspaces of this tenant.
    await trx('team_memberships')
      .whereIn(
        'team_id',
        trx('teams')
          .select('teams.id')
          .whereIn(
            'teams.workspace_id',
            trx('workspaces').select('id').where('tenant_id', input.tenantId)
          )
      )
      .where('user_id', existing.userId)
      .delete();
    // Project user-access grants for projects in workspaces of this tenant.
    await trx('project_user_access')
      .whereIn(
        'project_id',
        trx('projects')
          .select('projects.id')
          .whereIn(
            'projects.workspace_id',
            trx('workspaces').select('id').where('tenant_id', input.tenantId)
          )
      )
      .where('user_id', existing.userId)
      .delete();

    const ok = await membershipService.deleteTenantMembership(existing.id, trx);
    if (!ok) throw new AppError('Failed to remove tenant membership', 500);
  });
}
