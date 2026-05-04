import type { Knex } from 'knex';
import { db } from '../db/knex.js';
import { Issue, type IssueRow } from '../entities/Issue.js';
import type { IssueType, StatusId, Priority } from '../lib/constants.js';

const COLUMNS = [
  'id',
  'workspace_id',
  'project_id',
  'key',
  'seq',
  'type',
  'status',
  'priority',
  'title',
  'description',
  'labels',
  'assignee_user_id',
  'reporter_user_id',
  'parent_issue_id',
  'created_at',
  'updated_at',
] as const;

type Q = Knex | Knex.Transaction;

export interface IssueFilters {
  status?: StatusId;
  type?: IssueType;
  assigneeUserId?: string;
  label?: string;
  priority?: Priority;
  projectId?: string;
}

function applyFilters<T extends Knex.QueryBuilder>(q: T, filters: IssueFilters): T {
  if (filters.status) q.where('status', filters.status);
  if (filters.type) q.where('type', filters.type);
  if (filters.assigneeUserId) q.where('assignee_user_id', filters.assigneeUserId);
  if (filters.priority) q.where('priority', filters.priority);
  if (filters.projectId) q.where('project_id', filters.projectId);
  // labels[] is a Postgres text[]; `?` operator tests for membership.
  if (filters.label) q.whereRaw('labels @> ARRAY[?]::text[]', [filters.label]);
  return q;
}

export async function getById(id: string, trx?: Q): Promise<Issue | null> {
  const q = (trx ?? db)('issues').where('id', id).select(COLUMNS).first();
  const row = (await q) as IssueRow | undefined;
  return row ? Issue.fromRow(row) : null;
}

export async function findByKey(
  workspaceId: string,
  key: string,
  trx?: Q
): Promise<Issue | null> {
  const row = (await (trx ?? db)('issues')
    .where('workspace_id', workspaceId)
    .where('key', key)
    .select(COLUMNS)
    .first()) as IssueRow | undefined;
  return row ? Issue.fromRow(row) : null;
}

export async function listByProject(
  projectId: string,
  filters: IssueFilters = {},
  trx?: Q
): Promise<Issue[]> {
  const q = (trx ?? db)('issues').where('project_id', projectId);
  applyFilters(q, filters);
  const rows = (await q.select(COLUMNS).orderBy('seq', 'asc')) as IssueRow[];
  return rows.map(Issue.fromRow);
}

export async function listByWorkspace(
  workspaceId: string,
  filters: IssueFilters = {},
  trx?: Q
): Promise<Issue[]> {
  const q = (trx ?? db)('issues').where('workspace_id', workspaceId);
  applyFilters(q, filters);
  const rows = (await q.select(COLUMNS).orderBy('created_at', 'desc')) as IssueRow[];
  return rows.map(Issue.fromRow);
}

export interface CreateIssueInput {
  workspaceId: string;
  projectId: string;
  key: string;
  seq: number;
  type: IssueType;
  status?: StatusId;
  priority?: Priority;
  title: string;
  description?: string | null;
  labels?: string[];
  assigneeUserId?: string | null;
  reporterUserId?: string | null;
  parentIssueId?: string | null;
}

export async function create(input: CreateIssueInput, trx?: Q): Promise<Issue> {
  const [row] = (await (trx ?? db)('issues')
    .insert({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      key: input.key,
      seq: input.seq,
      type: input.type,
      status: input.status ?? 'backlog',
      priority: input.priority ?? 'none',
      title: input.title,
      description: input.description ?? null,
      labels: input.labels ?? [],
      assigneeUserId: input.assigneeUserId ?? null,
      reporterUserId: input.reporterUserId ?? null,
      parentIssueId: input.parentIssueId ?? null,
    })
    .returning(COLUMNS)) as IssueRow[];
  return Issue.fromRow(row);
}

export interface UpdateIssueInput {
  title?: string;
  description?: string | null;
  status?: StatusId;
  priority?: Priority;
  assigneeUserId?: string | null;
  labels?: string[];
  // parentIssueId is settable via this service so setIssueParent can
  // route through one place. The general-purpose updateIssue usecase
  // does NOT expose it — parent mutations have their own usecase +
  // endpoint to keep the type-pair / cycle / scope validation in one
  // spot.
  parentIssueId?: string | null;
}

export async function updateById(
  id: string,
  patch: UpdateIssueInput,
  trx?: Q
): Promise<Issue | null> {
  if (Object.keys(patch).length === 0) return getById(id, trx);
  const [row] = (await (trx ?? db)('issues')
    .where('id', id)
    .update({ ...patch, updatedAt: (trx ?? db).fn.now() })
    .returning(COLUMNS)) as IssueRow[];
  return row ? Issue.fromRow(row) : null;
}

/**
 * Return the ids of the direct children of `parentIssueId`, ordered by
 * `seq` ascending. Used by `getIssue` to populate the denormalised
 * `children` view in the API response.
 */
export async function findChildrenIds(parentIssueId: string, trx?: Q): Promise<string[]> {
  const rows = (await (trx ?? db)('issues')
    .where('parent_issue_id', parentIssueId)
    .select('id', 'seq')
    .orderBy('seq', 'asc')) as Array<{ id: string; seq: number }>;
  return rows.map((r) => r.id);
}

/**
 * Batch-fetch direct children for many parents at once. Used by list
 * endpoints to avoid N+1 — pass every issue id in the page and get a
 * `Map<parentId, childIds[]>` back. Parents with zero children are
 * NOT included in the map (callers should default to `[]`).
 *
 * Children come back ordered by `seq` ascending within each parent.
 */
export async function findChildrenIdsByParentIds(
  parentIds: string[],
  trx?: Q
): Promise<Map<string, string[]>> {
  if (parentIds.length === 0) return new Map();
  const rows = (await (trx ?? db)('issues')
    .whereIn('parent_issue_id', parentIds)
    .select('id', 'parent_issue_id', 'seq')
    .orderBy('seq', 'asc')) as Array<{ id: string; parentIssueId: string; seq: number }>;
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const arr = map.get(r.parentIssueId);
    if (arr) arr.push(r.id);
    else map.set(r.parentIssueId, [r.id]);
  }
  return map;
}

/**
 * Batch-fetch issue keys for a set of issue ids. Used by list / get
 * endpoints to translate the internal `parentIssueId` (uuid) into the
 * external `parent` (key) without N+1.
 */
export async function findKeysByIds(
  ids: string[],
  trx?: Q
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = (await (trx ?? db)('issues')
    .whereIn('id', ids)
    .select('id', 'key')) as Array<{ id: string; key: string }>;
  return new Map(rows.map((r) => [r.id, r.key]));
}
