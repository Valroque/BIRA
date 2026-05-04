import type { Workflow } from '../../entities/Workflow.js';
import type { WorkflowNode } from '../../entities/WorkflowNode.js';
import type { WorkflowTransition } from '../../entities/WorkflowTransition.js';
import type { WorkflowTransitionRule } from '../../entities/WorkflowTransitionRule.js';

/**
 * API-shape for a workflow. Includes nodes (slice 3) and transitions
 * with their rules (slice 5). Project_workflow assignment lives on a
 * separate, lighter shape (see getProjectWorkflows).
 */
export interface WorkflowView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  workspaceId: string;
  nodes: Array<{
    id: string;
    statusId: string;
    x: number;
    y: number;
    isInitial: boolean;
    isTerminal: boolean;
  }>;
  transitions: Array<{
    id: string;
    fromNodeId: string;
    toNodeId: string;
    label: string | null;
    dashed: boolean;
    rules: Array<{
      id: string;
      type: WorkflowTransitionRule['type'];
      params: WorkflowTransitionRule['params'];
    }>;
  }>;
  createdAt: string;
  updatedAt: string | null;
}

export function toWorkflowView(
  workflow: Workflow,
  nodes: WorkflowNode[],
  transitions: WorkflowTransition[],
  rulesByTransitionId: Map<string, WorkflowTransitionRule[]>
): WorkflowView {
  return {
    id: workflow.id,
    slug: workflow.slug,
    name: workflow.name,
    description: workflow.description,
    workspaceId: workflow.workspaceId,
    nodes: nodes.map((n) => ({
      id: n.id,
      statusId: n.statusId,
      x: n.x,
      y: n.y,
      isInitial: n.isInitial,
      isTerminal: n.isTerminal,
    })),
    transitions: transitions.map((t) => ({
      id: t.id,
      fromNodeId: t.fromNodeId,
      toNodeId: t.toNodeId,
      label: t.label,
      dashed: t.dashed,
      rules: (rulesByTransitionId.get(t.id) ?? []).map((r) => ({
        id: r.id,
        type: r.type,
        params: r.params,
      })),
    })),
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  };
}
