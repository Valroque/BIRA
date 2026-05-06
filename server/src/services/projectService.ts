import type { Knex } from 'knex';
import { db } from '../db/knex.js';
import { Project, type ProjectRow } from '../entities/Project.js';
import type { ProjectStatus } from '../lib/constants.js';

type Q = Knex | Knex.Transaction;

const COLUMNS = [
  'id',
  'workspace_id',
  'slug',
  'key',
  'name',
  'letter',
  'color',
  'bg',
  'description',
  'status',
  'created_by_user_id',
  'created_at',
  'updated_at',
] as const;

export async function getById(id: string): Promise<Project | null> {
  const row = (await db('projects').where('id', id).select(COLUMNS).first()) as
    | ProjectRow
    | undefined;
  return row ? Project.fromRow(row) : null;
}

export async function findBySlug(
  workspaceId: string,
  slug: string,
  trx?: Q
): Promise<Project | null> {
  const row = (await (trx ?? db)('projects')
    .where('workspace_id', workspaceId)
    .whereRaw('LOWER(slug) = LOWER(?)', [slug])
    .select(COLUMNS)
    .first()) as ProjectRow | undefined;
  return row ? Project.fromRow(row) : null;
}

export interface ListByWorkspaceOptions {
  /** Include archived projects in the result. Default false. */
  includeArchived?: boolean;
}

export async function listByWorkspace(
  workspaceId: string,
  opts: ListByWorkspaceOptions = {}
): Promise<Project[]> {
  const q = db('projects').where('workspace_id', workspaceId);
  if (!opts.includeArchived) q.where('status', 'active');
  const rows = (await q.select(COLUMNS).orderBy('created_at', 'asc')) as ProjectRow[];
  return rows.map(Project.fromRow);
}

export interface CreateProjectInput {
  workspaceId: string;
  slug: string;
  key: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
  description?: string;
  status?: ProjectStatus;
  createdByUserId?: string | null;
}

export async function create(input: CreateProjectInput, trx?: Q): Promise<Project> {
  const [row] = (await (trx ?? db)('projects')
    .insert({
      workspaceId: input.workspaceId,
      slug: input.slug,
      key: input.key,
      name: input.name,
      letter: input.letter,
      color: input.color,
      bg: input.bg,
      description: input.description ?? '',
      status: input.status ?? 'active',
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning(COLUMNS)) as ProjectRow[];
  return Project.fromRow(row);
}

export interface UpdateProjectInput {
  name?: string;
  letter?: string;
  color?: string;
  bg?: string;
  description?: string;
}

export async function update(id: string, patch: UpdateProjectInput): Promise<Project | null> {
  if (Object.keys(patch).length === 0) return getById(id);
  const [row] = (await db('projects')
    .where('id', id)
    .update({ ...patch, updatedAt: db.fn.now() })
    .returning(COLUMNS)) as ProjectRow[];
  return row ? Project.fromRow(row) : null;
}

export async function setStatus(id: string, status: ProjectStatus): Promise<Project | null> {
  const [row] = (await db('projects')
    .where('id', id)
    .update({ status, updatedAt: db.fn.now() })
    .returning(COLUMNS)) as ProjectRow[];
  return row ? Project.fromRow(row) : null;
}
