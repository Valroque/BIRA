import type { Knex } from 'knex';
import { db } from '../db/knex.js';
import { AppError } from '../lib/errors.js';
import type { Role } from '../lib/constants.js';

/**
 * Project access — two-table design.
 *
 * `project_team_access` and `project_user_access` carry independent
 * grants. `computeEffectiveMembers` collapses both (plus tenant /
 * workspace admins) into a single per-user role using a precedence
 * rule that mirrors the FE resolver:
 *
 *   explicit-user > tenant-admin > workspace-admin > team-union
 *
 * Tenant admins inherit project admin; workspace admins do too. Team
 * grants combine via union (highest team role wins) and only kick in
 * when no explicit user grant or implicit admin coverage is in play.
 */

// ── Team grants ───────────────────────────────────────────────────────────

interface TeamAccessRow {
  id: string;
  projectId: string;
  teamId: string;
  role: 'write' | 'read';
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

interface UserAccessRow {
  id: string;
  projectId: string;
  userId: string;
  role: Role;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const TEAM_COLUMNS = [
  'id',
  'project_id',
  'team_id',
  'role',
  'created_at',
  'updated_at',
] as const;

const USER_COLUMNS = [
  'id',
  'project_id',
  'user_id',
  'role',
  'created_at',
  'updated_at',
] as const;

// ── Hydrated views ────────────────────────────────────────────────────────

export interface TeamAccessView {
  id: string;
  teamId: string;
  role: 'write' | 'read';
  team: {
    id: string;
    slug: string;
    name: string;
    color: string;
    memberCount: number;
  };
}

export interface UserAccessView {
  id: string;
  userId: string;
  role: Role;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    displayName: string;
  };
}

export interface ProjectAccessView {
  projectId: string;
  teams: TeamAccessView[];
  users: UserAccessView[];
}

interface TeamJoinRow {
  id: string;
  teamId: string;
  role: 'write' | 'read';
  tSlug: string;
  tName: string;
  tColor: string;
  memberCount: string | number;
}

interface UserJoinRow {
  id: string;
  userId: string;
  role: Role;
  uEmail: string;
  uFirstName: string;
  uLastName: string;
  uAvatar: string | null;
}

export async function listAccess(projectId: string): Promise<ProjectAccessView> {
  const teamRows = (await db('project_team_access as pta')
    .join('teams as t', 't.id', 'pta.team_id')
    .leftJoin('team_memberships as tm', 'tm.team_id', 't.id')
    .where('pta.project_id', projectId)
    .groupBy('pta.id', 'pta.team_id', 'pta.role', 't.slug', 't.name', 't.color')
    .select(
      'pta.id as id',
      'pta.team_id as teamId',
      'pta.role as role',
      't.slug as tSlug',
      't.name as tName',
      't.color as tColor',
      db.raw('count(tm.id) as memberCount')
    )
    .orderBy('t.name', 'asc')) as TeamJoinRow[];

  const userRows = (await db('project_user_access as pua')
    .join('users as u', 'u.id', 'pua.user_id')
    .where('pua.project_id', projectId)
    .select(
      'pua.id as id',
      'pua.user_id as userId',
      'pua.role as role',
      'u.email as uEmail',
      'u.first_name as uFirstName',
      'u.last_name as uLastName',
      'u.avatar as uAvatar'
    )
    .orderBy('u.first_name', 'asc')) as UserJoinRow[];

  return {
    projectId,
    teams: teamRows.map((r) => ({
      id: r.id,
      teamId: r.teamId,
      role: r.role,
      team: {
        id: r.teamId,
        slug: r.tSlug,
        name: r.tName,
        color: r.tColor,
        memberCount:
          typeof r.memberCount === 'string' ? Number(r.memberCount) : r.memberCount,
      },
    })),
    users: userRows.map((r) => ({
      id: r.id,
      userId: r.userId,
      role: r.role,
      user: {
        id: r.userId,
        email: r.uEmail,
        firstName: r.uFirstName,
        lastName: r.uLastName,
        avatar: r.uAvatar,
        displayName: `${r.uFirstName} ${r.uLastName}`.trim(),
      },
    })),
  };
}

// ── Team-grant CRUD ───────────────────────────────────────────────────────

async function teamBelongsToWorkspace(
  teamId: string,
  workspaceId: string
): Promise<boolean> {
  const row = (await db('teams').where({ id: teamId, workspaceId }).first()) as
    | { id: string }
    | undefined;
  return Boolean(row);
}

export async function getTeamAccessByPair(
  projectId: string,
  teamId: string
): Promise<TeamAccessRow | null> {
  const row = (await db('project_team_access')
    .where({ projectId, teamId })
    .select(TEAM_COLUMNS)
    .first()) as TeamAccessRow | undefined;
  return row ?? null;
}

export async function addTeamAccess(input: {
  projectId: string;
  teamId: string;
  role: 'write' | 'read';
  workspaceId: string;
}): Promise<TeamAccessRow> {
  if (!(await teamBelongsToWorkspace(input.teamId, input.workspaceId))) {
    throw new AppError('Team does not belong to this workspace', 400);
  }
  const existing = await getTeamAccessByPair(input.projectId, input.teamId);
  if (existing) {
    throw new AppError('Team already has access to this project', 409);
  }
  const [row] = (await db('project_team_access')
    .insert({ projectId: input.projectId, teamId: input.teamId, role: input.role })
    .returning(TEAM_COLUMNS)) as TeamAccessRow[];
  return row;
}

export async function updateTeamAccessRole(input: {
  projectId: string;
  teamId: string;
  role: 'write' | 'read';
}): Promise<TeamAccessRow> {
  const [row] = (await db('project_team_access')
    .where({ projectId: input.projectId, teamId: input.teamId })
    .update({ role: input.role, updatedAt: db.fn.now() })
    .returning(TEAM_COLUMNS)) as TeamAccessRow[];
  if (!row) throw new AppError('Team access grant not found', 404);
  return row;
}

export async function removeTeamAccess(input: {
  projectId: string;
  teamId: string;
}): Promise<boolean> {
  const count = await db('project_team_access')
    .where({ projectId: input.projectId, teamId: input.teamId })
    .delete();
  return count > 0;
}

// ── User-grant CRUD ───────────────────────────────────────────────────────

async function isWorkspaceMemberActive(
  userId: string,
  workspaceId: string,
  tenantId: string
): Promise<boolean> {
  // Explicit workspace membership wins; tenant admins count as
  // implicit workspace members (mirror the resolver). This lets a
  // workspace admin grant a tenant admin explicit project-user
  // access without the admin needing a redundant workspace_memberships
  // row.
  const explicit = (await db('workspace_memberships')
    .where({ userId, workspaceId, status: 'active' })
    .first()) as { id: string } | undefined;
  if (explicit) return true;
  const tenantAdmin = (await db('tenant_memberships')
    .where({ userId, tenantId, role: 'admin', status: 'active' })
    .first()) as { id: string } | undefined;
  return Boolean(tenantAdmin);
}

export async function getUserAccessByPair(
  projectId: string,
  userId: string
): Promise<UserAccessRow | null> {
  const row = (await db('project_user_access')
    .where({ projectId, userId })
    .select(USER_COLUMNS)
    .first()) as UserAccessRow | undefined;
  return row ?? null;
}

/**
 * Bootstrap-only insert. Skips the workspace-member + conflict checks
 * `addUserAccess` runs because those preconditions are already
 * guaranteed by the caller (the project-create flow that owns the
 * surrounding transaction). Use `addUserAccess` for any user-driven
 * grant; this path exists for the creator's automatic admin grant.
 */
export async function insertUserAccessInTx(
  input: { projectId: string; userId: string; role: Role },
  trx: Knex.Transaction
): Promise<void> {
  await trx('project_user_access').insert({
    projectId: input.projectId,
    userId: input.userId,
    role: input.role,
  });
}

export async function addUserAccess(input: {
  projectId: string;
  userId: string;
  role: Role;
  workspaceId: string;
  tenantId: string;
}): Promise<UserAccessRow> {
  if (!(await isWorkspaceMemberActive(input.userId, input.workspaceId, input.tenantId))) {
    throw new AppError('User is not an active workspace member', 400);
  }
  const existing = await getUserAccessByPair(input.projectId, input.userId);
  if (existing) {
    throw new AppError('User already has access to this project', 409);
  }
  const [row] = (await db('project_user_access')
    .insert({ projectId: input.projectId, userId: input.userId, role: input.role })
    .returning(USER_COLUMNS)) as UserAccessRow[];
  return row;
}

export async function updateUserAccessRole(input: {
  projectId: string;
  userId: string;
  role: Role;
}): Promise<UserAccessRow> {
  const [row] = (await db('project_user_access')
    .where({ projectId: input.projectId, userId: input.userId })
    .update({ role: input.role, updatedAt: db.fn.now() })
    .returning(USER_COLUMNS)) as UserAccessRow[];
  if (!row) throw new AppError('User access grant not found', 404);
  return row;
}

export async function removeUserAccess(input: {
  projectId: string;
  userId: string;
}): Promise<boolean> {
  const count = await db('project_user_access')
    .where({ projectId: input.projectId, userId: input.userId })
    .delete();
  return count > 0;
}

// ── Effective members ─────────────────────────────────────────────────────

export type Provenance = 'explicit-user' | 'tenant-admin' | 'workspace-admin' | 'team';

export interface ProjectEffectiveMember {
  userId: string;
  role: Role;
  provenance: Provenance;
  /** Set when provenance === 'team'; the workspace teams that contributed. */
  viaTeams?: { id: string; slug: string; name: string; role: 'write' | 'read' }[];
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    displayName: string;
  };
}

const ROLE_RANK: Record<Role, number> = { read: 0, write: 1, admin: 2 };

interface SourceRow {
  source: 'tenant' | 'workspace' | 'user' | 'team';
  userId: string;
  role: Role;
  teamId: string | null;
  teamSlug: string | null;
  teamName: string | null;
  teamRole: 'write' | 'read' | null;
  uEmail: string;
  uFirstName: string;
  uLastName: string;
  uAvatar: string | null;
}

/**
 * Compute the flat effective-member list for a project.
 *
 * Pulls four source sets in one UNION ALL query, then a TS reducer
 * applies the precedence rule:
 *
 *   1. explicit-user — wins outright.
 *   2. tenant-admin — admin coverage from a tenant admin row.
 *   3. workspace-admin — admin coverage from an explicit workspace
 *      `admin` row (or implicit via team is impossible since admin is
 *      never a team role).
 *   4. team — union of team grants (highest of `write` / `read`).
 *
 * Inactive workspace memberships and inactive tenant memberships are
 * filtered out in the SQL — the contract is "members able to act on
 * the project right now", not "ever had access".
 */
export async function computeEffectiveMembers(
  projectId: string,
  workspaceId: string,
  tenantId: string
): Promise<ProjectEffectiveMember[]> {
  const result = (await db.raw(
    `
    WITH src AS (
      -- Source 1: tenant admins (active tenant_memberships).
      SELECT 'tenant'::text AS source,
             tm.user_id     AS user_id,
             'admin'::text  AS role,
             NULL::uuid     AS team_id,
             NULL::text     AS team_slug,
             NULL::text     AS team_name,
             NULL::text     AS team_role
      FROM tenant_memberships tm
      WHERE tm.tenant_id = ?
        AND tm.role = 'admin'
        AND tm.status = 'active'

      UNION ALL

      -- Source 2: explicit workspace admins (active workspace_memberships).
      SELECT 'workspace'::text,
             wm.user_id,
             'admin'::text,
             NULL::uuid, NULL::text, NULL::text, NULL::text
      FROM workspace_memberships wm
      WHERE wm.workspace_id = ?
        AND wm.role = 'admin'
        AND wm.status = 'active'

      UNION ALL

      -- Source 3: explicit project-user grants.
      SELECT 'user'::text,
             pua.user_id,
             pua.role,
             NULL::uuid, NULL::text, NULL::text, NULL::text
      FROM project_user_access pua
      WHERE pua.project_id = ?

      UNION ALL

      -- Source 4: team-derived grants. Expanded via team_memberships.
      SELECT 'team'::text,
             tmem.user_id,
             pta.role,
             pta.team_id,
             t.slug,
             t.name,
             pta.role
      FROM project_team_access pta
      JOIN teams t ON t.id = pta.team_id
      JOIN team_memberships tmem ON tmem.team_id = pta.team_id
      WHERE pta.project_id = ?
    )
    SELECT src.source       AS source,
           src.user_id      AS "userId",
           src.role         AS role,
           src.team_id      AS "teamId",
           src.team_slug    AS "teamSlug",
           src.team_name    AS "teamName",
           src.team_role    AS "teamRole",
           u.email          AS "uEmail",
           u.first_name     AS "uFirstName",
           u.last_name      AS "uLastName",
           u.avatar         AS "uAvatar"
    FROM src
    JOIN users u ON u.id = src.user_id
    `,
    [tenantId, workspaceId, projectId, projectId]
  )) as { rows: SourceRow[] };

  // Reduce: per user, pick the highest-precedence source. For 'team'
  // we union and keep the highest role.
  type Bucket = {
    userId: string;
    role: Role;
    provenance: Provenance;
    viaTeams?: ProjectEffectiveMember['viaTeams'];
    user: ProjectEffectiveMember['user'];
  };
  const PRECEDENCE: Record<Provenance, number> = {
    'explicit-user': 4,
    'tenant-admin': 3,
    'workspace-admin': 2,
    team: 1,
  };

  const map = new Map<string, Bucket>();

  for (const row of result.rows) {
    const userView = {
      id: row.userId,
      email: row.uEmail,
      firstName: row.uFirstName,
      lastName: row.uLastName,
      avatar: row.uAvatar,
      displayName: `${row.uFirstName} ${row.uLastName}`.trim(),
    };
    const provenance: Provenance =
      row.source === 'user'
        ? 'explicit-user'
        : row.source === 'tenant'
          ? 'tenant-admin'
          : row.source === 'workspace'
            ? 'workspace-admin'
            : 'team';

    const existing = map.get(row.userId);
    if (!existing) {
      map.set(row.userId, {
        userId: row.userId,
        role: row.role,
        provenance,
        viaTeams:
          provenance === 'team' && row.teamId
            ? [
                {
                  id: row.teamId,
                  slug: row.teamSlug ?? '',
                  name: row.teamName ?? '',
                  role: (row.teamRole ?? 'read') as 'write' | 'read',
                },
              ]
            : undefined,
        user: userView,
      });
      continue;
    }

    const existingPrec = PRECEDENCE[existing.provenance];
    const newPrec = PRECEDENCE[provenance];

    if (newPrec > existingPrec) {
      existing.role = row.role;
      existing.provenance = provenance;
      existing.viaTeams =
        provenance === 'team' && row.teamId
          ? [
              {
                id: row.teamId,
                slug: row.teamSlug ?? '',
                name: row.teamName ?? '',
                role: (row.teamRole ?? 'read') as 'write' | 'read',
              },
            ]
          : undefined;
    } else if (newPrec === existingPrec && provenance === 'team' && row.teamId) {
      // Union of team grants — keep highest role; append source team.
      if (ROLE_RANK[row.role] > ROLE_RANK[existing.role]) existing.role = row.role;
      existing.viaTeams = existing.viaTeams ?? [];
      existing.viaTeams.push({
        id: row.teamId,
        slug: row.teamSlug ?? '',
        name: row.teamName ?? '',
        role: (row.teamRole ?? 'read') as 'write' | 'read',
      });
    }
    // Otherwise: lower precedence — ignore.
  }

  // Sort by displayName for a deterministic response.
  return Array.from(map.values())
    .map((b) => ({ ...b }))
    .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));
}
