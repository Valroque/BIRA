import type { Knex } from 'knex';
import { db } from '../db/knex.js';
import type { IssueType } from '../lib/constants.js';

type Q = Knex | Knex.Transaction;

export interface ProjectWorkflowRow {
  id: string;
  projectId: string;
  issueType: IssueType;
  workflowId: string;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const COLUMNS = [
  'id',
  'project_id',
  'issue_type',
  'workflow_id',
  'created_at',
  'updated_at',
] as const;

export async function listByProject(projectId: string, trx?: Q): Promise<ProjectWorkflowRow[]> {
  const rows = (await (trx ?? db)('project_workflows')
    .where('project_id', projectId)
    .select(COLUMNS)) as ProjectWorkflowRow[];
  return rows;
}

export async function listByProjects(
  projectIds: string[],
  trx?: Q
): Promise<Map<string, ProjectWorkflowRow[]>> {
  if (projectIds.length === 0) return new Map();
  const rows = (await (trx ?? db)('project_workflows')
    .whereIn('project_id', projectIds)
    .select(COLUMNS)) as ProjectWorkflowRow[];
  const out = new Map<string, ProjectWorkflowRow[]>();
  for (const r of rows) {
    const arr = out.get(r.projectId);
    if (arr) arr.push(r);
    else out.set(r.projectId, [r]);
  }
  return out;
}

export async function findByPair(
  projectId: string,
  issueType: IssueType,
  trx?: Q
): Promise<ProjectWorkflowRow | null> {
  const row = (await (trx ?? db)('project_workflows')
    .where('project_id', projectId)
    .where('issue_type', issueType)
    .select(COLUMNS)
    .first()) as ProjectWorkflowRow | undefined;
  return row ?? null;
}

/**
 * Upsert (project, issue_type) → workflow_id. Knex's onConflict-merge
 * handles the upsert in one round-trip.
 */
export async function upsert(
  projectId: string,
  issueType: IssueType,
  workflowId: string,
  trx?: Q
): Promise<ProjectWorkflowRow> {
  const [row] = (await (trx ?? db)('project_workflows')
    .insert({ projectId, issueType, workflowId })
    .onConflict(['project_id', 'issue_type'])
    .merge({ workflowId, updatedAt: (trx ?? db).fn.now() })
    .returning(COLUMNS)) as ProjectWorkflowRow[];
  return row;
}
