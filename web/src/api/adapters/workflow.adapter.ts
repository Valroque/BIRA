// Workflow + project-workflow adapters.
//
// Workflows are first-class entities. Each workflow has nodes (states with
// layout coords), transitions (directed edges), and rules (closed enum of
// 5 types) per transition. The BE returns nodes/edges with stable UUIDs +
// layout coordinates — the FE uses those directly so the editor doesn't
// need to compute its own layout.
//
// `(project, issue_type)` selects one workflow. The BE returns this as
// `Record<IssueType, WorkflowSummary | null>` from
// `getProjectWorkflows`. Null means there's neither an explicit assignment
// nor a default workflow available — surface as "Unassigned" in the UI.

import type { IssueTypeLetter } from '../../fixtures';
import { requireField, expectField } from '../lib/adapterContract';

// ---------------------------------------------------------------------------
// Rule types — closed enum, mirrors `RULE_TYPES` in
// server/src/entities/WorkflowTransitionRule.ts.
// ---------------------------------------------------------------------------

export const WORKFLOW_RULE_TYPES = [
  'role',
  'assignee_only',
  'reporter_only',
  'required_fields',
  'not_self',
] as const;
export type WorkflowRuleType = (typeof WORKFLOW_RULE_TYPES)[number];

/**
 * Discriminated by `type`:
 *   role             → { role: 'admin' | 'write' | 'read' }
 *   required_fields  → { fields: string[] }
 *   assignee_only / reporter_only / not_self → null
 */
export type WorkflowRuleParams =
  | { role: 'admin' | 'write' | 'read' }
  | { fields: string[] }
  | null;

// ---------------------------------------------------------------------------
// Raw BE shape — mirrors `WorkflowView` from
// server/src/usecases/workflows/workflowView.ts.
// ---------------------------------------------------------------------------

export interface RawWorkflowNode {
  id: string;
  statusId: string;
  x: number;
  y: number;
  isInitial: boolean;
  isTerminal: boolean;
}

export interface RawWorkflowRule {
  id: string;
  type: WorkflowRuleType;
  params: unknown;
}

export interface RawWorkflowTransition {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label: string | null;
  dashed: boolean;
  rules: RawWorkflowRule[];
}

export interface RawWorkflow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  workspaceId: string;
  nodes: RawWorkflowNode[];
  transitions: RawWorkflowTransition[];
  createdAt: string;
  updatedAt: string | null;
}

/** BE returns `Record<IssueType, WorkflowSummary | null>`. */
export type RawProjectWorkflowMap = Record<
  IssueTypeLetter,
  { id: string; slug: string; name: string } | null
>;

// ---------------------------------------------------------------------------
// FE shape — translated from raw. The graph editor (`screens/workflow.tsx`)
// has been speaking node/edge w/ x/y/initial/terminal/count/rules for a
// while; this adapter keeps those field names stable so the editor doesn't
// have to change. `count` and `rules` are derived (count is unknown on the
// BE — set to 0; rules is the size of each transition's rule list, so we
// derive a per-node sum from incoming + outgoing transitions).
// ---------------------------------------------------------------------------

export interface WorkflowNode {
  id: string;
  statusId: string;
  x: number;
  y: number;
  /** Issues currently in this state — not exposed by the BE; defaults to 0. */
  count: number;
  /** Number of rules attached to transitions touching this node. */
  rules: number;
  initial?: boolean;
  terminal?: boolean;
}

export interface WorkflowRule {
  id: string;
  type: WorkflowRuleType;
  params: WorkflowRuleParams;
}

export interface WorkflowEdge {
  id: string;
  /** Source node UUID. Renamed `from` to align with the existing FE editor. */
  from: string;
  /** Target node UUID. Renamed `to` to align with the existing FE editor. */
  to: string;
  label?: string;
  dashed?: boolean;
  rules: WorkflowRule[];
}

export interface Workflow {
  id: string;
  slug: string;
  name: string;
  description: string;
  workspaceId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string | null;
}

/** Per-issue-type workflow summary (or null if no workflow is assigned/defaulted). */
export interface WorkflowAssignmentSummary {
  id: string;
  slug: string;
  name: string;
}

export type ProjectWorkflowMap = Record<
  IssueTypeLetter,
  WorkflowAssignmentSummary | null
>;

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Coerce raw rule params to the typed FE shape. Rules with malformed params
 * are reported via the contract logger but kept (UI just renders generic
 * "params unavailable" rather than dropping the rule).
 */
function adaptRuleParams(
  type: WorkflowRuleType,
  params: unknown,
  ctx: { id: string },
): WorkflowRuleParams {
  if (type === 'role') {
    if (params && typeof params === 'object' && !Array.isArray(params)) {
      const role = (params as { role?: unknown }).role;
      if (role === 'admin' || role === 'write' || role === 'read') {
        return { role };
      }
    }
    expectField(undefined, undefined, {
      entity: 'WorkflowRule', field: 'params.role', id: ctx.id,
    });
    return { role: 'admin' };
  }
  if (type === 'required_fields') {
    if (params && typeof params === 'object' && !Array.isArray(params)) {
      const fields = (params as { fields?: unknown }).fields;
      if (Array.isArray(fields) && fields.every((f) => typeof f === 'string')) {
        return { fields: fields as string[] };
      }
    }
    expectField(undefined, undefined, {
      entity: 'WorkflowRule', field: 'params.fields', id: ctx.id,
    });
    return { fields: [] };
  }
  // assignee_only / reporter_only / not_self — params is null.
  return null;
}

export function adaptWorkflow(raw: RawWorkflow): Workflow {
  const id = requireField(raw.id, '', { entity: 'Workflow', field: 'id' });
  const slug = requireField(raw.slug, '', { entity: 'Workflow', field: 'slug', id });
  const name = requireField(raw.name, '', { entity: 'Workflow', field: 'name', id });
  const workspaceId = requireField(raw.workspaceId, '', {
    entity: 'Workflow', field: 'workspaceId', id,
  });

  const description = expectField(raw.description ?? '', '', {
    entity: 'Workflow', field: 'description', id,
  });

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawTransitions = Array.isArray(raw.transitions) ? raw.transitions : [];

  // Tally how many rules touch each node so the editor can show "N rules" in
  // the node card without re-walking transitions on every render.
  const rulesByNode = new Map<string, number>();
  for (const t of rawTransitions) {
    const count = Array.isArray(t.rules) ? t.rules.length : 0;
    if (count === 0) continue;
    rulesByNode.set(t.fromNodeId, (rulesByNode.get(t.fromNodeId) ?? 0) + count);
    if (t.toNodeId !== t.fromNodeId) {
      rulesByNode.set(t.toNodeId, (rulesByNode.get(t.toNodeId) ?? 0) + count);
    }
  }

  const nodes: WorkflowNode[] = rawNodes.map((n) => ({
    id: n.id,
    statusId: n.statusId,
    x: n.x,
    y: n.y,
    count: 0,
    rules: rulesByNode.get(n.id) ?? 0,
    ...(n.isInitial ? { initial: true } : {}),
    ...(n.isTerminal ? { terminal: true } : {}),
  }));

  const edges: WorkflowEdge[] = rawTransitions.map((t) => ({
    id: t.id,
    from: t.fromNodeId,
    to: t.toNodeId,
    ...(t.label ? { label: t.label } : {}),
    ...(t.dashed ? { dashed: true } : {}),
    rules: (Array.isArray(t.rules) ? t.rules : []).map((r) => ({
      id: r.id,
      type: r.type,
      params: adaptRuleParams(r.type, r.params, { id: r.id }),
    })),
  }));

  return {
    id,
    slug,
    name,
    description,
    workspaceId,
    nodes,
    edges,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? null,
  };
}

/**
 * Adapt the BE's `Record<IssueType, WorkflowSummary | null>`. Null entries
 * pass through — they mean "no workflow assigned and no default available".
 */
export function adaptProjectWorkflowMap(raw: RawProjectWorkflowMap): ProjectWorkflowMap {
  const out = {} as ProjectWorkflowMap;
  const types: IssueTypeLetter[] = ['T', 'B', 'S', 'E'];
  for (const t of types) {
    const summary = raw?.[t];
    if (!summary) {
      out[t] = null;
      continue;
    }
    out[t] = {
      id: requireField(summary.id, '', { entity: 'WorkflowSummary', field: 'id' }),
      slug: requireField(summary.slug, '', { entity: 'WorkflowSummary', field: 'slug', id: summary.id }),
      name: requireField(summary.name, '', { entity: 'WorkflowSummary', field: 'name', id: summary.id }),
    };
  }
  return out;
}
