import type { Knex } from 'knex';
import { db } from '../db/knex.js';
import { Milestone, type MilestoneRow } from '../entities/Milestone.js';

const COLUMNS = [
  'id',
  'workspace_id',
  'project_id',
  'name',
  'description',
  'date',
  'created_at',
  'updated_at',
] as const;

type Q = Knex | Knex.Transaction;

export interface MilestoneFilters {
  /** Limit a workspace-scoped list to one project. Ignored on listByProject. */
  projectId?: string;
}

function applyFilters<T extends Knex.QueryBuilder>(q: T, filters: MilestoneFilters): T {
  if (filters.projectId) q.where('project_id', filters.projectId);
  return q;
}

export async function getById(id: string, trx?: Q): Promise<Milestone | null> {
  const row = (await (trx ?? db)('milestones').where('id', id).select(COLUMNS).first()) as
    | MilestoneRow
    | undefined;
  return row ? Milestone.fromRow(row) : null;
}

export async function listByProject(
  projectId: string,
  filters: MilestoneFilters = {},
  trx?: Q
): Promise<Milestone[]> {
  const q = (trx ?? db)('milestones').where('project_id', projectId);
  applyFilters(q, filters);
  // Soonest deadline first — matches the FE's reading order on the
  // milestones tab and the project gantt's vertical line ordering.
  const rows = (await q.select(COLUMNS).orderBy('date', 'asc')) as MilestoneRow[];
  return rows.map(Milestone.fromRow);
}

export async function listByWorkspace(
  workspaceId: string,
  filters: MilestoneFilters = {},
  trx?: Q
): Promise<Milestone[]> {
  const q = (trx ?? db)('milestones').where('workspace_id', workspaceId);
  applyFilters(q, filters);
  const rows = (await q.select(COLUMNS).orderBy('date', 'asc')) as MilestoneRow[];
  return rows.map(Milestone.fromRow);
}

export interface CreateMilestoneInput {
  workspaceId: string;
  projectId: string;
  name: string;
  description?: string | null;
  date: string; // YYYY-MM-DD
}

export async function create(input: CreateMilestoneInput, trx?: Q): Promise<Milestone> {
  const [row] = (await (trx ?? db)('milestones')
    .insert({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      name: input.name,
      description: input.description ?? null,
      date: input.date,
    })
    .returning(COLUMNS)) as MilestoneRow[];
  return Milestone.fromRow(row);
}

export interface UpdateMilestoneInput {
  name?: string;
  description?: string | null;
  date?: string;
}

export async function updateById(
  id: string,
  patch: UpdateMilestoneInput,
  trx?: Q
): Promise<Milestone | null> {
  if (Object.keys(patch).length === 0) return getById(id, trx);
  const [row] = (await (trx ?? db)('milestones')
    .where('id', id)
    .update({ ...patch, updatedAt: (trx ?? db).fn.now() })
    .returning(COLUMNS)) as MilestoneRow[];
  return row ? Milestone.fromRow(row) : null;
}

/**
 * Hard-delete a milestone by id. Returns true when a row was deleted,
 * false when no row matched. Callers (the deleteMilestone usecase) lift
 * the boolean into a 404 when needed.
 */
export async function deleteById(id: string, trx?: Q): Promise<boolean> {
  const deleted = await (trx ?? db)('milestones').where('id', id).delete();
  return deleted > 0;
}
