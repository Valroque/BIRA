import type { Knex } from 'knex';
import { db } from '../db/knex.js';
import { AppError } from '../lib/errors.js';
import { Team, type TeamRow } from '../entities/Team.js';
import { TeamMembership, type TeamMembershipRow } from '../entities/TeamMembership.js';

const TEAM_COLUMNS = [
  'id',
  'workspace_id',
  'slug',
  'name',
  'description',
  'color',
  'created_by_user_id',
  'created_at',
  'updated_at',
] as const;

const TEAM_MEMBERSHIP_COLUMNS = [
  'id',
  'team_id',
  'user_id',
  'created_at',
  'updated_at',
] as const;

export interface TeamMemberRef {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  displayName: string;
}

export interface TeamView {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string;
  color: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string | null;
  memberCount: number;
  members: TeamMemberRef[];
}

interface UserJoinRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
}

function teamView(team: Team, members: TeamMemberRef[]): TeamView {
  return {
    id: team.id,
    workspaceId: team.workspaceId,
    slug: team.slug,
    name: team.name,
    description: team.description,
    color: team.color,
    createdByUserId: team.createdByUserId,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
    memberCount: members.length,
    members,
  };
}

async function membersForTeams(teamIds: string[]): Promise<Map<string, TeamMemberRef[]>> {
  const out = new Map<string, TeamMemberRef[]>();
  if (teamIds.length === 0) return out;
  const rows = (await db('team_memberships as tm')
    .join('users as u', 'u.id', 'tm.user_id')
    .whereIn('tm.team_id', teamIds)
    .select(
      'tm.team_id as teamId',
      'u.id as id',
      'u.email as email',
      'u.first_name as firstName',
      'u.last_name as lastName',
      'u.avatar as avatar'
    )
    .orderBy('u.first_name', 'asc')) as Array<UserJoinRow & { teamId: string }>;
  for (const r of rows) {
    const ref: TeamMemberRef = {
      userId: r.id,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      avatar: r.avatar,
      displayName: `${r.firstName} ${r.lastName}`.trim(),
    };
    const list = out.get(r.teamId) ?? [];
    list.push(ref);
    out.set(r.teamId, list);
  }
  return out;
}

export async function listForWorkspace(workspaceId: string): Promise<TeamView[]> {
  const teamRows = (await db('teams')
    .where('workspace_id', workspaceId)
    .select(TEAM_COLUMNS)
    .orderBy('name', 'asc')) as TeamRow[];
  const teams = teamRows.map(Team.fromRow);
  const members = await membersForTeams(teams.map((t) => t.id));
  return teams.map((t) => teamView(t, members.get(t.id) ?? []));
}

export async function getById(
  id: string,
  trx?: Knex.Transaction
): Promise<Team | null> {
  const row = (await (trx ?? db)('teams')
    .where('id', id)
    .select(TEAM_COLUMNS)
    .first()) as TeamRow | undefined;
  return row ? Team.fromRow(row) : null;
}

export async function getBySlug(
  workspaceId: string,
  slug: string
): Promise<Team | null> {
  const row = (await db('teams')
    .where('workspace_id', workspaceId)
    .whereRaw('LOWER(slug) = LOWER(?)', [slug])
    .select(TEAM_COLUMNS)
    .first()) as TeamRow | undefined;
  return row ? Team.fromRow(row) : null;
}

export async function viewById(id: string): Promise<TeamView | null> {
  const team = await getById(id);
  if (!team) return null;
  const members = await membersForTeams([team.id]);
  return teamView(team, members.get(team.id) ?? []);
}

export interface CreateTeamInput {
  workspaceId: string;
  slug: string;
  name: string;
  description?: string;
  color: string;
  createdByUserId: string;
}

export async function create(input: CreateTeamInput): Promise<Team> {
  const [row] = (await db('teams')
    .insert({
      workspaceId: input.workspaceId,
      slug: input.slug,
      name: input.name,
      description: input.description ?? '',
      color: input.color,
      createdByUserId: input.createdByUserId,
    })
    .returning(TEAM_COLUMNS)) as TeamRow[];
  return Team.fromRow(row);
}

export interface UpdateTeamInput {
  name?: string;
  description?: string;
  color?: string;
}

export async function update(
  id: string,
  patch: UpdateTeamInput
): Promise<Team | null> {
  if (Object.keys(patch).length === 0) return getById(id);
  const [row] = (await db('teams')
    .where('id', id)
    .update({ ...patch, updatedAt: db.fn.now() })
    .returning(TEAM_COLUMNS)) as TeamRow[];
  return row ? Team.fromRow(row) : null;
}

export async function remove(id: string): Promise<boolean> {
  // FK CASCADE on `team_memberships` and (when Domain C lands) on
  // `project_team_access` cleans up dependent rows automatically.
  const count = await db('teams').where('id', id).delete();
  return count > 0;
}

// ── Team memberships ──────────────────────────────────────────────────────

async function isWorkspaceMember(
  userId: string,
  workspaceId: string,
  trx?: Knex.Transaction
): Promise<boolean> {
  const row = (await (trx ?? db)('workspace_memberships')
    .where({ userId, workspaceId, status: 'active' })
    .first()) as { id: string } | undefined;
  return Boolean(row);
}

export async function getTeamMembership(
  teamId: string,
  userId: string
): Promise<TeamMembership | null> {
  const row = (await db('team_memberships')
    .where({ teamId, userId })
    .select(TEAM_MEMBERSHIP_COLUMNS)
    .first()) as TeamMembershipRow | undefined;
  return row ? TeamMembership.fromRow(row) : null;
}

export async function addMember(input: {
  teamId: string;
  userId: string;
  workspaceId: string;
}): Promise<TeamMembership> {
  if (!(await isWorkspaceMember(input.userId, input.workspaceId))) {
    throw new AppError('User is not a workspace member', 400);
  }
  const existing = await getTeamMembership(input.teamId, input.userId);
  if (existing) {
    throw new AppError('User is already a member of this team', 409);
  }
  const [row] = (await db('team_memberships')
    .insert({ teamId: input.teamId, userId: input.userId })
    .returning(TEAM_MEMBERSHIP_COLUMNS)) as TeamMembershipRow[];
  return TeamMembership.fromRow(row);
}

export async function removeMember(input: {
  teamId: string;
  userId: string;
}): Promise<boolean> {
  const count = await db('team_memberships')
    .where({ teamId: input.teamId, userId: input.userId })
    .delete();
  return count > 0;
}
