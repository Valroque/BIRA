import { db } from '../db/knex.js';

export interface MentionableHit {
  type: 'user' | 'team';
  id: string;
  label: string;
  sublabel: string;
  avatarUrl?: string;
}

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
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
    // TODO: implement once workspace_teams table exists.
    buckets.push([]);
  }

  return buckets.flat().slice(0, limit);
}
