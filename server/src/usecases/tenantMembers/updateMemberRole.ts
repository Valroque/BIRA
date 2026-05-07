import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import * as membershipService from '../../services/membershipService.js';
import type { Role } from '../../lib/constants.js';
import type { TenantMemberView } from '../../services/membershipService.js';

export interface UpdateTenantMemberRoleInput {
  tenantId: string;
  userId: string;
  role: Role;
}

/**
 * Patch a tenant membership's role.
 *
 * Last-admin guard: refuse a demotion that would leave the tenant with
 * zero active admins. Tenants have no team-derived admin (v1 rule:
 * tenant admin is only ever explicit-on-user), so the count is just the
 * explicit `tenant_memberships` set. Guard runs inside the same
 * transaction as the update so two concurrent demotions can't both pass.
 */
export async function updateTenantMemberRole(
  input: UpdateTenantMemberRoleInput
): Promise<TenantMemberView> {
  await db.transaction(async (trx) => {
    const existing = await membershipService.getTenantMembership(
      input.userId,
      input.tenantId
    );
    if (!existing) throw new AppError('Tenant membership not found', 404);

    if (existing.role === input.role) return;

    if (existing.role === 'admin' && input.role !== 'admin') {
      const remaining = await membershipService.countActiveTenantAdmins(
        input.tenantId,
        existing.userId,
        trx
      );
      if (remaining === 0) {
        throw new AppError(
          'Cannot demote the last admin of this tenant — promote another member first',
          409
        );
      }
    }

    const updated = await membershipService.updateTenantMembership(
      existing.id,
      { role: input.role },
      trx
    );
    if (!updated) throw new AppError('Failed to update tenant membership', 500);
  });

  const list = await membershipService.listTenantMembers(input.tenantId);
  const view = list.find((m) => m.userId === input.userId);
  if (!view) throw new AppError('Failed to read back tenant member', 500);
  return view;
}
