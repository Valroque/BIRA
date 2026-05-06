import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { db } from '../db/knex.js';
import { Workflow, type WorkflowRow } from '../entities/Workflow.js';
import { WorkflowNode, type WorkflowNodeRow } from '../entities/WorkflowNode.js';
import {
  WorkflowTransition,
  type WorkflowTransitionRow,
} from '../entities/WorkflowTransition.js';
import {
  WorkflowTransitionRule,
  type WorkflowTransitionRuleRow,
  type RuleType,
} from '../entities/WorkflowTransitionRule.js';
import type { StatusId } from '../lib/constants.js';

type Q = Knex | Knex.Transaction;

const WORKFLOW_COLUMNS = [
  'id',
  'workspace_id',
  'slug',
  'name',
  'description',
  'created_at',
  'updated_at',
] as const;

const NODE_COLUMNS = [
  'id',
  'workflow_id',
  'status_id',
  'x',
  'y',
  'is_initial',
  'is_terminal',
] as const;

const TRANSITION_COLUMNS = [
  'id',
  'workflow_id',
  'from_node_id',
  'to_node_id',
  'label',
  'dashed',
  'created_at',
  'updated_at',
] as const;

const RULE_COLUMNS = ['id', 'transition_id', 'type', 'params', 'created_at', 'updated_at'] as const;

// ---------- workflows ----------

export async function getById(id: string, trx?: Q): Promise<Workflow | null> {
  const row = (await (trx ?? db)('workflows').where('id', id).select(WORKFLOW_COLUMNS).first()) as
    | WorkflowRow
    | undefined;
  return row ? Workflow.fromRow(row) : null;
}

export async function findBySlug(
  workspaceId: string,
  slug: string,
  trx?: Q
): Promise<Workflow | null> {
  const row = (await (trx ?? db)('workflows')
    .where('workspace_id', workspaceId)
    .whereRaw('LOWER(slug) = LOWER(?)', [slug])
    .select(WORKFLOW_COLUMNS)
    .first()) as WorkflowRow | undefined;
  return row ? Workflow.fromRow(row) : null;
}

export async function listByWorkspace(workspaceId: string, trx?: Q): Promise<Workflow[]> {
  const rows = (await (trx ?? db)('workflows')
    .where('workspace_id', workspaceId)
    .select(WORKFLOW_COLUMNS)
    .orderBy('created_at', 'asc')) as WorkflowRow[];
  return rows.map(Workflow.fromRow);
}

export interface CreateWorkflowInput {
  workspaceId: string;
  slug: string;
  name: string;
  description?: string | null;
}

export async function create(input: CreateWorkflowInput, trx?: Q): Promise<Workflow> {
  const [row] = (await (trx ?? db)('workflows')
    .insert({
      workspaceId: input.workspaceId,
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
    })
    .returning(WORKFLOW_COLUMNS)) as WorkflowRow[];
  return Workflow.fromRow(row);
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string | null;
}

export async function updateById(
  id: string,
  patch: UpdateWorkflowInput,
  trx?: Q
): Promise<Workflow | null> {
  if (Object.keys(patch).length === 0) return getById(id, trx);
  const [row] = (await (trx ?? db)('workflows')
    .where('id', id)
    .update({ ...patch, updatedAt: (trx ?? db).fn.now() })
    .returning(WORKFLOW_COLUMNS)) as WorkflowRow[];
  return row ? Workflow.fromRow(row) : null;
}

export async function deleteById(id: string, trx?: Q): Promise<boolean> {
  const n = await (trx ?? db)('workflows').where('id', id).del();
  return n > 0;
}

// ---------- workflow nodes ----------

export interface WorkflowNodeInput {
  /**
   * Optional client-supplied uuid. When present, the inserted row uses
   * this id verbatim; transitions in the same PATCH may reference it.
   * When absent, a fresh uuid is minted at insert time. Validated for
   * within-input uniqueness by `validateNodes`.
   */
  id?: string;
  statusId: StatusId;
  x: number;
  y: number;
  isInitial?: boolean;
  isTerminal?: boolean;
}

export async function listNodesByWorkflow(workflowId: string, trx?: Q): Promise<WorkflowNode[]> {
  const rows = (await (trx ?? db)('workflow_nodes')
    .where('workflow_id', workflowId)
    .select(NODE_COLUMNS)) as WorkflowNodeRow[];
  return rows.map(WorkflowNode.fromRow);
}

export async function listNodesByWorkflows(
  workflowIds: string[],
  trx?: Q
): Promise<Map<string, WorkflowNode[]>> {
  if (workflowIds.length === 0) return new Map();
  const rows = (await (trx ?? db)('workflow_nodes')
    .whereIn('workflow_id', workflowIds)
    .select(NODE_COLUMNS)) as WorkflowNodeRow[];
  const out = new Map<string, WorkflowNode[]>();
  for (const r of rows) {
    const node = WorkflowNode.fromRow(r);
    const arr = out.get(node.workflowId);
    if (arr) arr.push(node);
    else out.set(node.workflowId, [node]);
  }
  return out;
}

/**
 * Atomic delete-then-insert. Used by both create and update — workflow
 * node sets are full-replace. Cascades through `workflow_transitions`
 * (FK ON DELETE CASCADE) when nodes go away.
 */
export async function replaceNodes(
  workflowId: string,
  nodes: WorkflowNodeInput[],
  trx: Knex.Transaction
): Promise<WorkflowNode[]> {
  await trx('workflow_nodes').where('workflow_id', workflowId).del();
  if (nodes.length === 0) return [];
  const rows = (await trx('workflow_nodes')
    .insert(
      nodes.map((n) => ({
        // Preserve client-supplied id when present so transitions
        // referencing existing node uuids (e.g. from a prior GET) survive
        // the full-replace; mint a fresh uuid otherwise. Within-input
        // uniqueness is enforced by validateNodes before we get here.
        id: n.id ?? randomUUID(),
        workflowId,
        statusId: n.statusId,
        x: n.x,
        y: n.y,
        isInitial: n.isInitial ?? false,
        isTerminal: n.isTerminal ?? false,
      }))
    )
    .returning(NODE_COLUMNS)) as WorkflowNodeRow[];
  return rows.map(WorkflowNode.fromRow);
}

// ---------- workflow transitions (slice 5) ----------

export interface WorkflowTransitionInput {
  fromNodeId: string;
  toNodeId: string;
  label?: string | null;
  dashed?: boolean;
  rules?: WorkflowTransitionRuleInput[];
}

export interface WorkflowTransitionRuleInput {
  type: RuleType;
  // Loose at the service boundary — the validator in the usecase layer
  // narrows / rejects based on `type` before this lands.
  params?: unknown;
}

export async function listTransitionsByWorkflow(
  workflowId: string,
  trx?: Q
): Promise<WorkflowTransition[]> {
  const rows = (await (trx ?? db)('workflow_transitions')
    .where('workflow_id', workflowId)
    .select(TRANSITION_COLUMNS)) as WorkflowTransitionRow[];
  return rows.map(WorkflowTransition.fromRow);
}

export async function listTransitionsByWorkflows(
  workflowIds: string[],
  trx?: Q
): Promise<Map<string, WorkflowTransition[]>> {
  if (workflowIds.length === 0) return new Map();
  const rows = (await (trx ?? db)('workflow_transitions')
    .whereIn('workflow_id', workflowIds)
    .select(TRANSITION_COLUMNS)) as WorkflowTransitionRow[];
  const out = new Map<string, WorkflowTransition[]>();
  for (const r of rows) {
    const t = WorkflowTransition.fromRow(r);
    const arr = out.get(t.workflowId);
    if (arr) arr.push(t);
    else out.set(t.workflowId, [t]);
  }
  return out;
}

export async function listRulesByTransitions(
  transitionIds: string[],
  trx?: Q
): Promise<Map<string, WorkflowTransitionRule[]>> {
  if (transitionIds.length === 0) return new Map();
  const rows = (await (trx ?? db)('workflow_transition_rules')
    .whereIn('transition_id', transitionIds)
    .select(RULE_COLUMNS)) as WorkflowTransitionRuleRow[];
  const out = new Map<string, WorkflowTransitionRule[]>();
  for (const r of rows) {
    const rule = WorkflowTransitionRule.fromRow(r);
    const arr = out.get(rule.transitionId);
    if (arr) arr.push(rule);
    else out.set(rule.transitionId, [rule]);
  }
  return out;
}

/**
 * Atomic delete-then-insert for the transitions of a workflow. Rules
 * cascade-die with their transitions and are then re-inserted from
 * the input.
 */
export async function replaceTransitions(
  workflowId: string,
  transitions: WorkflowTransitionInput[],
  trx: Knex.Transaction
): Promise<WorkflowTransition[]> {
  await trx('workflow_transitions').where('workflow_id', workflowId).del();
  const out: WorkflowTransition[] = [];
  for (const tr of transitions) {
    const [row] = (await trx('workflow_transitions')
      .insert({
        workflowId,
        fromNodeId: tr.fromNodeId,
        toNodeId: tr.toNodeId,
        label: tr.label ?? null,
        dashed: tr.dashed ?? false,
      })
      .returning(TRANSITION_COLUMNS)) as WorkflowTransitionRow[];
    const transition = WorkflowTransition.fromRow(row);
    if (tr.rules && tr.rules.length > 0) {
      await trx('workflow_transition_rules').insert(
        tr.rules.map((r) => ({
          transitionId: transition.id,
          type: r.type,
          // Knex/pg adapter handles JSON serialisation when the column is
          // jsonb — but be explicit to avoid surprises with arrays.
          params: r.params === null || r.params === undefined ? null : JSON.stringify(r.params),
        }))
      );
    }
    out.push(transition);
  }
  return out;
}
