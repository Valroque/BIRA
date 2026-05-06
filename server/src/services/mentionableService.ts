import { db } from '../db/knex.js';

export interface MentionableHit {
  type: 'user' | 'team';
  id: string;
  label: string;
  sublabel: string;
  avatarUrl?: string;
  /** Workspace-unique slug for team hits (omitted for users). */
  slug?: string;
  /** Team color for team hits (omitted for users). */
  color?: string;
}

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface TeamRow {
  id: string;
  name: string;
  slug: string;
  color: string;
  memberCount: string | number;
}

async function searchUsers(workspaceId: string, q: string): Promise<MentionableHit[]> {
  const prefix = q + '%';
  const substr = '%' + q + '%';

  const baseQuery = () =>
    db('workspace_memberships as wm')
      .join('users as u', 'u.id', 'wm.userId')
      .where('wm.workspaceId', workspaceId)
      .select('u.id', 'u.firstName', 'u.lastName', 'u.email');

  // Pass 1: prefix match on any name/email segment — these rank higher.
  const prefixRows = (await baseQuery().where(function () {
    this.whereILike('u.firstName', prefix)
      .orWhereILike('u.lastName', prefix)
      .orWhereILike('u.email', prefix);
  })) as UserRow[];

  const prefixIds = new Set(prefixRows.map((r) => r.id));

  // Pass 2: substring match — deduplicate against prefix results.
  const substrRows = (await baseQuery()
    .where(function () {
      this.whereILike('u.firstName', substr)
        .orWhereILike('u.lastName', substr)
        .orWhereILike('u.email', substr);
    })
    .whereNotIn('u.id', Array.from(prefixIds))) as UserRow[];

  const toHit = (row: UserRow): MentionableHit => ({
    type: 'user',
    id: row.id,
    label: `${row.firstName} ${row.lastName}`.trim(),
    sublabel: row.email,
  });

  const sortByLabel = (a: MentionableHit, b: MentionableHit) =>
    a.label.localeCompare(b.label);

  const prefixHits = prefixRows.map(toHit).sort(sortByLabel);
  const substrHits = substrRows.map(toHit).sort(sortByLabel);

  return [...prefixHits, ...substrHits];
}

export async function searchMentionables(params: {
  workspaceId: string;
  tenantId: string;
  q: string;
  types: Array<'user' | 'team'>;
  limit: number;
}): Promise<MentionableHit[]> {
  const { workspaceId, q, types, limit } = params;

  const buckets: MentionableHit[][] = [];

  if (types.includes('user')) {
    buckets.push(await searchUsers(workspaceId, q));
  }

  if (types.includes('team')) {
    buckets.push(await searchTeams(workspaceId, q));
  }

  return buckets.flat().slice(0, limit);
}

async function searchTeams(workspaceId: string, q: string): Promise<MentionableHit[]> {
  const prefix = q + '%';
  const substr = '%' + q + '%';

  const baseQuery = () =>
    db('teams as t')
      .leftJoin('team_memberships as tm', 't.id', 'tm.team_id')
      .where('t.workspace_id', workspaceId)
      .groupBy('t.id', 't.name', 't.slug', 't.color')
      .select(
        't.id as id',
        't.name as name',
        't.slug as slug',
        't.color as color',
        db.raw('count(tm.id) as memberCount')
      );

  // Pass 1: prefix match on team name OR slug.
  const prefixRows = (await baseQuery().where(function () {
    this.whereILike('t.name', prefix).orWhereILike('t.slug', prefix);
  })) as TeamRow[];

  const prefixIds = new Set(prefixRows.map((r) => r.id));

  // Pass 2: substring match — deduplicate against prefix results.
  const substrRows = (await baseQuery()
    .where(function () {
      this.whereILike('t.name', substr).orWhereILike('t.slug', substr);
    })
    .whereNotIn('t.id', Array.from(prefixIds))) as TeamRow[];

  const toHit = (row: TeamRow): MentionableHit => {
    const count = typeof row.memberCount === 'string' ? Number(row.memberCount) : row.memberCount;
    return {
      type: 'team',
      id: row.id,
      label: row.name,
      sublabel: count === 1 ? '1 member' : `${count} members`,
      slug: row.slug,
      color: row.color,
    };
  };

  const sortByLabel = (a: MentionableHit, b: MentionableHit) => a.label.localeCompare(b.label);

  const prefixHits = prefixRows.map(toHit).sort(sortByLabel);
  const substrHits = substrRows.map(toHit).sort(sortByLabel);

  return [...prefixHits, ...substrHits];
}
