import { db } from '../db/knex.js';
import { Workspace, type WorkspaceRow } from '../entities/Workspace.js';
import type { WorkspaceStatus } from '../lib/constants.js';

const COLUMNS = [
  'id',
  'tenant_id',
  'slug',
  'name',
  'letter',
  'color',
  'bg',
  'status',
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

export interface ListByTenantOptions {
  /** When true, archived workspaces are included in the result. Default false. */
  includeArchived?: boolean;
}

export async function listByTenant(
  tenantId: string,
  opts: ListByTenantOptions = {}
): Promise<Workspace[]> {
  const q = db('workspaces').where('tenant_id', tenantId);
  if (!opts.includeArchived) q.where('status', 'active');
  const rows = (await q.select(COLUMNS).orderBy('name', 'asc')) as WorkspaceRow[];
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

export interface UpdateWorkspaceInput {
  name?: string;
  letter?: string;
  color?: string;
  bg?: string;
}

export async function update(id: string, patch: UpdateWorkspaceInput): Promise<Workspace | null> {
  if (Object.keys(patch).length === 0) return getById(id);
  const [row] = (await db('workspaces')
    .where('id', id)
    .update({ ...patch, updatedAt: db.fn.now() })
    .returning(COLUMNS)) as WorkspaceRow[];
  return row ? Workspace.fromRow(row) : null;
}

export async function setStatus(id: string, status: WorkspaceStatus): Promise<Workspace | null> {
  const [row] = (await db('workspaces')
    .where('id', id)
    .update({ status, updatedAt: db.fn.now() })
    .returning(COLUMNS)) as WorkspaceRow[];
  return row ? Workspace.fromRow(row) : null;
}
