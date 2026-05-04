import { db } from '../db/knex.js';
import { Project, type ProjectRow } from '../entities/Project.js';
import type { ProjectStatus } from '../lib/constants.js';

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

export async function findBySlug(workspaceId: string, slug: string): Promise<Project | null> {
  const row = (await db('projects')
    .where('workspace_id', workspaceId)
    .whereRaw('LOWER(slug) = LOWER(?)', [slug])
    .select(COLUMNS)
    .first()) as ProjectRow | undefined;
  return row ? Project.fromRow(row) : null;
}

export async function listByWorkspace(workspaceId: string): Promise<Project[]> {
  const rows = (await db('projects')
    .where('workspace_id', workspaceId)
    .select(COLUMNS)
    .orderBy('created_at', 'asc')) as ProjectRow[];
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

export async function create(input: CreateProjectInput): Promise<Project> {
  const [row] = (await db('projects')
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
