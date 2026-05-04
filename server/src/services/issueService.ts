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
