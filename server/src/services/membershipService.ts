import type { Knex } from 'knex';
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

export async function addTenantMember(
  input: AddTenantMemberInput,
  trx?: Knex.Transaction
): Promise<TenantMembershipRow> {
  const q = (trx ?? db)('tenant_memberships');
  const [row] = (await q
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

export interface WorkspaceMembershipRow {
  id: string;
  userId: string;
  workspaceId: string;
  role: Role;
  status: TenantMembershipStatus;
  lastSeenAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const WORKSPACE_MEMBERSHIP_COLUMNS = [
  'id',
  'user_id',
  'workspace_id',
  'role',
  'status',
  'last_seen_at',
  'created_at',
  'updated_at',
] as const;

export async function getWorkspaceMembership(
  userId: string,
  workspaceId: string
): Promise<WorkspaceMembershipRow | null> {
  const row = (await db('workspace_memberships')
    .where({ userId, workspaceId })
    .select(WORKSPACE_MEMBERSHIP_COLUMNS)
    .first()) as WorkspaceMembershipRow | undefined;
  return row ?? null;
}

export async function getWorkspaceMembershipById(
  id: string,
  trx?: Knex.Transaction
): Promise<WorkspaceMembershipRow | null> {
  const row = (await (trx ?? db)('workspace_memberships')
    .where('id', id)
    .select(WORKSPACE_MEMBERSHIP_COLUMNS)
    .first()) as WorkspaceMembershipRow | undefined;
  return row ?? null;
}

export interface AddWorkspaceMemberInput {
  userId: string;
  workspaceId: string;
  role: Role;
  status?: TenantMembershipStatus;
}

export async function addWorkspaceMember(
  input: AddWorkspaceMemberInput,
  trx?: Knex.Transaction
): Promise<WorkspaceMembershipRow> {
  const [row] = (await (trx ?? db)('workspace_memberships')
    .insert({
      userId: input.userId,
      workspaceId: input.workspaceId,
      role: input.role,
      status: input.status ?? 'active',
    })
    .returning(WORKSPACE_MEMBERSHIP_COLUMNS)) as WorkspaceMembershipRow[];
  return row;
}

export async function updateWorkspaceMembershipRole(
  id: string,
  role: Role,
  trx?: Knex.Transaction
): Promise<WorkspaceMembershipRow | null> {
  const [row] = (await (trx ?? db)('workspace_memberships')
    .where('id', id)
    .update({ role, updatedAt: db.fn.now() })
    .returning(WORKSPACE_MEMBERSHIP_COLUMNS)) as WorkspaceMembershipRow[];
  return row ?? null;
}

export async function deleteWorkspaceMembership(
  id: string,
  trx?: Knex.Transaction
): Promise<boolean> {
  const count = await (trx ?? db)('workspace_memberships').where('id', id).delete();
  return count > 0;
}

// ── Hydrated views ────────────────────────────────────────────────────────

export interface TenantMemberView {
  membershipId: string;
  userId: string;
  tenantId: string;
  role: Role;
  status: TenantMembershipStatus;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    isActive: boolean;
    displayName: string;
  };
}

/**
 * List tenant members hydrated with user details.
 *
 * Two independent queries combined in JS (per project rule: no SQL JOINs
 * without explicit approval — memory: feedback_no_db_joins_without_approval):
 *   1. `tenant_memberships` rows for the tenant
 *   2. `users` rows for those userIds
 *
 * Sorted alphabetically by display name. No implicit / synthetic rows —
 * tenant membership has no parent layer to inherit from, so every row
 * here is a real `tenant_memberships` row with a real uuid `membershipId`.
 */
export async function listTenantMembers(
  tenantId: string
): Promise<TenantMemberView[]> {
  const memberships = (await db('tenant_memberships')
    .where('tenant_id', tenantId)
    .select(
      'id as membershipId',
      'user_id as userId',
      'tenant_id as tenantId',
      'role',
      'status',
      'last_seen_at as lastSeenAt',
      'created_at as createdAt',
      'updated_at as updatedAt'
    )) as Array<{
    membershipId: string;
    userId: string;
    tenantId: string;
    role: Role;
    status: TenantMembershipStatus;
    lastSeenAt: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string | null;
  }>;

  const userIds = memberships.map((m) => m.userId);
  const userRows = userIds.length === 0 ? [] : ((await db('users')
    .whereIn('id', userIds)
    .select(
      'id',
      'email',
      'first_name as firstName',
      'last_name as lastName',
      'avatar',
      'is_active as isActive'
    )) as Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    isActive: boolean;
  }>);
  const userById = new Map(userRows.map((u) => [u.id, u]));

  const isoOrNull = (v: Date | string | null) =>
    v === null ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString();
  const iso = (v: Date | string) =>
    v instanceof Date ? v.toISOString() : new Date(v).toISOString();

  const views: TenantMemberView[] = [];
  for (const m of memberships) {
    const user = userById.get(m.userId);
    if (!user) continue; // FK guarantees this won't happen; defensive.
    views.push({
      membershipId: m.membershipId,
      userId: m.userId,
      tenantId: m.tenantId,
      role: m.role,
      status: m.status,
      lastSeenAt: isoOrNull(m.lastSeenAt),
      createdAt: iso(m.createdAt),
      updatedAt: m.updatedAt ? iso(m.updatedAt) : null,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isActive: user.isActive,
        displayName: `${user.firstName} ${user.lastName}`.trim(),
      },
    });
  }

  views.sort((a, b) => {
    const an = a.user.firstName + a.user.lastName;
    const bn = b.user.firstName + b.user.lastName;
    return an.localeCompare(bn);
  });

  return views;
}

export interface WorkspaceMemberView {
  membershipId: string;
  userId: string;
  workspaceId: string;
  role: Role;
  status: TenantMembershipStatus;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    isActive: boolean;
    displayName: string;
  };
  /**
   * True when the user is also a tenant admin — surfaced so the FE can
   * show the implicit-admin badge and the BE last-admin-guard can count
   * implicit admins too.
   */
  tenantAdmin: boolean;
}

/**
 * Sentinel prefix on `membershipId` for synthetic rows that represent
 * tenant admins with implicit access to a workspace (no row in
 * `workspace_memberships`). Mutation endpoints (PATCH role / DELETE
 * member) reject these ids at the Zod boundary — `MembershipIdParam`
 * requires uuid format, which the sentinel deliberately fails.
 */
export const TENANT_ADMIN_MEMBERSHIP_PREFIX = 'tenant-admin:';

export function isImplicitMembershipId(id: string): boolean {
  return id.startsWith(TENANT_ADMIN_MEMBERSHIP_PREFIX);
}

// Tombstone: `listWorkspaceMembers` used to do a 3-way SQL join
// (workspace_memberships × users × tenant_memberships) + a second join
// for the implicit set. Refactored 2026-05-06 to three independent
// queries combined in JS, per the project rule (memory:
// feedback_no_db_joins_without_approval).

/**
 * List workspace members, hydrated with user details and tenant-admin
 * status, including **implicit** members (tenant admins who have access
 * to every workspace by virtue of their tenant role, with no explicit
 * `workspace_memberships` row).
 *
 * Uses three independent queries combined in the application layer
 * (per project rule: no SQL JOINs without explicit approval):
 *   1. `workspace_memberships` for the explicit set
 *   2. active tenant admins on `tenant_memberships` — provides both
 *      (a) the implicit set and (b) the `tenantAdmin` flag on explicit rows
 *   3. `users` for all userIds across both sets
 *
 * Implicit rows carry a sentinel `membershipId` (`tenant-admin:<userId>`)
 * so the FE can render them and the BE rejects mutations at the Zod
 * boundary (`MembershipIdParam` requires uuid format).
 *
 * Mirrors the policy used by `countEffectiveWorkspaceAdmins` so the
 * directory view and the last-admin guard count the same set.
 */
export async function listWorkspaceMembers(
  workspaceId: string,
  tenantId: string
): Promise<WorkspaceMemberView[]> {
  // Q1 — explicit workspace memberships.
  const memberships = (await db('workspace_memberships')
    .where('workspace_id', workspaceId)
    .select(
      'id as membershipId',
      'user_id as userId',
      'workspace_id as workspaceId',
      'role',
      'status',
      'last_seen_at as lastSeenAt',
      'created_at as createdAt',
      'updated_at as updatedAt'
    )) as Array<{
    membershipId: string;
    userId: string;
    workspaceId: string;
    role: Role;
    status: TenantMembershipStatus;
    lastSeenAt: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string | null;
  }>;

  // Q2 — active tenant admins on this tenant.
  const tenantAdminRows = (await db('tenant_memberships')
    .where('tenant_id', tenantId)
    .where('role', 'admin')
    .where('status', 'active')
    .select('user_id as userId', 'created_at as createdAt', 'updated_at as updatedAt')) as Array<{
    userId: string;
    createdAt: Date | string;
    updatedAt: Date | string | null;
  }>;
  const tenantAdminIds = new Set(tenantAdminRows.map((t) => t.userId));
  const tenantAdminById = new Map(tenantAdminRows.map((t) => [t.userId, t]));

  // Q3 — user details for all userIds we need.
  const userIds = new Set<string>([
    ...memberships.map((m) => m.userId),
    ...tenantAdminRows.map((t) => t.userId),
  ]);
  const userRows = userIds.size === 0 ? [] : ((await db('users')
    .whereIn('id', [...userIds])
    .select(
      'id',
      'email',
      'first_name as firstName',
      'last_name as lastName',
      'avatar',
      'is_active as isActive'
    )) as Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    isActive: boolean;
  }>);
  const userById = new Map(userRows.map((u) => [u.id, u]));

  // Helper: format Date | string | null → ISO or null.
  const isoOrNull = (v: Date | string | null) =>
    v === null ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString();
  const iso = (v: Date | string) =>
    v instanceof Date ? v.toISOString() : new Date(v).toISOString();

  // Combine 1: explicit memberships → views.
  const explicitViews: WorkspaceMemberView[] = [];
  for (const m of memberships) {
    const user = userById.get(m.userId);
    if (!user) continue; // FK guarantees this won't happen, but be defensive
    explicitViews.push({
      membershipId: m.membershipId,
      userId: m.userId,
      workspaceId: m.workspaceId,
      role: m.role,
      status: m.status,
      lastSeenAt: isoOrNull(m.lastSeenAt),
      createdAt: iso(m.createdAt),
      updatedAt: m.updatedAt ? iso(m.updatedAt) : null,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isActive: user.isActive,
        displayName: `${user.firstName} ${user.lastName}`.trim(),
      },
      tenantAdmin: tenantAdminIds.has(m.userId),
    });
  }

  // Combine 2: implicit tenant admins (those NOT already explicit).
  const explicitUserIds = new Set(memberships.map((m) => m.userId));
  const implicitViews: WorkspaceMemberView[] = [];
  for (const t of tenantAdminRows) {
    if (explicitUserIds.has(t.userId)) continue;
    const user = userById.get(t.userId);
    if (!user) continue;
    const adminRow = tenantAdminById.get(t.userId)!;
    implicitViews.push({
      membershipId: `${TENANT_ADMIN_MEMBERSHIP_PREFIX}${t.userId}`,
      userId: t.userId,
      workspaceId,
      role: 'admin',
      status: 'active',
      lastSeenAt: null,
      createdAt: iso(adminRow.createdAt),
      updatedAt: isoOrNull(adminRow.updatedAt),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isActive: user.isActive,
        displayName: `${user.firstName} ${user.lastName}`.trim(),
      },
      tenantAdmin: true,
    });
  }

  const combined = [...explicitViews, ...implicitViews];
  combined.sort((a, b) => {
    const an = a.user.firstName + a.user.lastName;
    const bn = b.user.firstName + b.user.lastName;
    return an.localeCompare(bn);
  });

  return combined;
}

/**
 * Count active admins on a workspace, INCLUDING implicit admins
 * (active tenant admins). Used by the last-admin guard so a workspace
 * never ends up with zero admin coverage.
 */
export async function countEffectiveWorkspaceAdmins(
  workspaceId: string,
  tenantId: string,
  excludeUserId: string | null = null,
  trx?: Knex.Transaction
): Promise<number> {
  const k = trx ?? db;

  // Explicit workspace admins (active status).
  const explicitQ = k('workspace_memberships')
    .where('workspace_id', workspaceId)
    .where('role', 'admin')
    .where('status', 'active');
  if (excludeUserId) explicitQ.whereNot('user_id', excludeUserId);
  const explicitRows = (await explicitQ.select('user_id as userId')) as { userId: string }[];

  // Implicit admins: active tenant admins. Their workspace role is
  // resolved as 'admin' regardless of any explicit workspace row.
  const tenantQ = k('tenant_memberships')
    .where('tenant_id', tenantId)
    .where('role', 'admin')
    .where('status', 'active');
  if (excludeUserId) tenantQ.whereNot('user_id', excludeUserId);
  const tenantRows = (await tenantQ.select('user_id as userId')) as { userId: string }[];

  const ids = new Set<string>();
  for (const r of explicitRows) ids.add(r.userId);
  for (const r of tenantRows) ids.add(r.userId);
  return ids.size;
}

// ── Effective role resolution ─────────────────────────────────────────────

/**
 * Resolve a user's effective workspace role.
 *
 * Resolution ladder (highest match wins):
 *  1. Tenant admin → admin in every workspace within that tenant.
 *  2. Explicit `workspace_memberships` grant (active rows only).
 *  3. Project-derived implicit `'read'` — any active row in
 *     `project_user_access`, OR membership in any team that has a row
 *     in `project_team_access` for a project in this workspace. Lets
 *     a user invited only to a single project still navigate the
 *     workspace shell.
 *  4. Otherwise: null (no access).
 *
 * Branch 3 lands with Domain C — `project_user_access`,
 * `project_team_access`, and `team_memberships` are created there.
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
  if (wm && wm.status === 'active') return wm.role;

  // Branch 3 (Domain C.4): project-only access falls back to
  // workspace `'read'`. Single SQL with two EXISTS subqueries — one
  // for direct user grants, one for team-derived grants. Keeps the
  // FE's project-scoped contributor flow viable without granting
  // workspace `write`.
  //
  // `db.raw()` bypasses knex-stringcase and Postgres lowercases
  // unquoted aliases, so we read `has_access` (snake) here even
  // though the rest of the codebase camelCases.
  const fallback = (await db.raw(
    `
    SELECT (EXISTS (
      SELECT 1
      FROM project_user_access pua
      JOIN projects p ON p.id = pua.project_id
      WHERE pua.user_id = ?
        AND p.workspace_id = ?
    ) OR EXISTS (
      SELECT 1
      FROM project_team_access pta
      JOIN projects p ON p.id = pta.project_id
      JOIN team_memberships tmem ON tmem.team_id = pta.team_id
      WHERE tmem.user_id = ?
        AND p.workspace_id = ?
    )) AS has_access
    `,
    [userId, workspaceId, userId, workspaceId]
  )) as { rows: { has_access: boolean }[] };

  return fallback.rows[0]?.has_access ? 'read' : null;
}
