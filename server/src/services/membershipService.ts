import { db } from '../db/knex.js';
import type { Role, TenantMembershipStatus } from '../lib/constants.js';

/**
 * Tenant + workspace memberships. Combined into a single service because
 * they share role-resolution logic and are typically queried together.
 */

// ── Tenant memberships ────────────────────────────────────────────────────

interface TenantMembershipRow {
  id: string;
  userId: string;
  tenantId: string;
  role: Role;
  status: TenantMembershipStatus;
  lastSeenAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

export async function getTenantMembership(
  userId: string,
  tenantId: string
): Promise<TenantMembershipRow | null> {
  const row = (await db('tenant_memberships')
    .where({ userId, tenantId })
    .first()) as TenantMembershipRow | undefined;
  return row ?? null;
}

export interface AddTenantMemberInput {
  userId: string;
  tenantId: string;
  role: Role;
  status?: TenantMembershipStatus;
}

export async function addTenantMember(input: AddTenantMemberInput): Promise<TenantMembershipRow> {
  const [row] = (await db('tenant_memberships')
    .insert({
      userId: input.userId,
      tenantId: input.tenantId,
      role: input.role,
      status: input.status ?? 'active',
    })
    .returning('*')) as TenantMembershipRow[];
  return row;
}

// ── Workspace memberships ─────────────────────────────────────────────────

interface WorkspaceMembershipRow {
  id: string;
  userId: string;
  workspaceId: string;
  role: Role;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

export async function getWorkspaceMembership(
  userId: string,
  workspaceId: string
): Promise<WorkspaceMembershipRow | null> {
  const row = (await db('workspace_memberships')
    .where({ userId, workspaceId })
    .first()) as WorkspaceMembershipRow | undefined;
  return row ?? null;
}

export interface AddWorkspaceMemberInput {
  userId: string;
  workspaceId: string;
  role: Role;
}

export async function addWorkspaceMember(
  input: AddWorkspaceMemberInput
): Promise<WorkspaceMembershipRow> {
  const [row] = (await db('workspace_memberships')
    .insert({
      userId: input.userId,
      workspaceId: input.workspaceId,
      role: input.role,
    })
    .returning('*')) as WorkspaceMembershipRow[];
  return row;
}

// ── Effective role resolution ─────────────────────────────────────────────

/**
 * Resolve a user's effective workspace role.
 *
 * Rules (mirror `feedback`/CLAUDE.md):
 *  1. Tenant admin → admin in every workspace within that tenant.
 *  2. Otherwise: explicit `workspace_memberships` grant, if any.
 *  3. Otherwise: null (no access).
 *
 * Project-level access (which would grant implicit `read`) is intentionally
 * not included here — `projects` membership is a later phase.
 */
export async function resolveEffectiveWorkspaceRole(
  userId: string,
  workspaceId: string,
  tenantId: string
): Promise<Role | null> {
  const tm = await getTenantMembership(userId, tenantId);
  if (!tm || tm.status !== 'active') return null;
  if (tm.role === 'admin') return 'admin';

  const wm = await getWorkspaceMembership(userId, workspaceId);
  return wm?.role ?? null;
}
