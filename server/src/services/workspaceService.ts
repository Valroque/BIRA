import { db } from '../db/knex.js';
import { Workspace, type WorkspaceRow } from '../entities/Workspace.js';

const COLUMNS = [
  'id',
  'tenant_id',
  'slug',
  'name',
  'letter',
  'color',
  'bg',
  'created_at',
  'updated_at',
] as const;

export async function getById(id: string): Promise<Workspace | null> {
  const row = (await db('workspaces').where('id', id).select(COLUMNS).first()) as
    | WorkspaceRow
    | undefined;
  return row ? Workspace.fromRow(row) : null;
}

export async function findBySlug(tenantId: string, slug: string): Promise<Workspace | null> {
  const row = (await db('workspaces')
    .where('tenant_id', tenantId)
    .whereRaw('LOWER(slug) = LOWER(?)', [slug])
    .select(COLUMNS)
    .first()) as WorkspaceRow | undefined;
  return row ? Workspace.fromRow(row) : null;
}

export async function listByTenant(tenantId: string): Promise<Workspace[]> {
  const rows = (await db('workspaces')
    .where('tenant_id', tenantId)
    .select(COLUMNS)
    .orderBy('name', 'asc')) as WorkspaceRow[];
  return rows.map(Workspace.fromRow);
}

export interface CreateWorkspaceInput {
  tenantId: string;
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
}

export async function create(input: CreateWorkspaceInput): Promise<Workspace> {
  const [row] = (await db('workspaces')
    .insert({
      tenantId: input.tenantId,
      slug: input.slug,
      name: input.name,
      letter: input.letter,
      color: input.color,
      bg: input.bg,
    })
    .returning(COLUMNS)) as WorkspaceRow[];
  return Workspace.fromRow(row);
}
