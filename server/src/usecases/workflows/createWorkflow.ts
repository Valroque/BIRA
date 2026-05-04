import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import * as workflowService from '../../services/workflowService.js';
import type {
  WorkflowNodeInput,
  WorkflowTransitionInput,
} from '../../services/workflowService.js';
import { toWorkflowView, type WorkflowView } from './workflowView.js';
import { validateNodes, validateTransitions } from './validators.js';

export interface CreateWorkflowInput {
  workspaceId: string;
  slug: string;
  name: string;
  description?: string | null;
  nodes: WorkflowNodeInput[];
  transitions?: WorkflowTransitionInput[];
}

/**
 * Create a workflow with its initial node + transition set in a single
 * transaction. Slug is unique per workspace (409 on collision).
 */
export async function createWorkflow(input: CreateWorkflowInput): Promise<WorkflowView> {
  if (!input.name || !input.name.trim()) {
    throw new AppError('Workflow name is required', 400);
  }
  validateNodes(input.nodes);

  return db.transaction(async (trx) => {
    const existing = await workflowService.findBySlug(input.workspaceId, input.slug, trx);
    if (existing) {
      throw new AppError(`A workflow with slug '${input.slug}' already exists`, 409);
    }

    const workflow = await workflowService.create(
      {
        workspaceId: input.workspaceId,
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
      },
      trx
    );

    const nodes = await workflowService.replaceNodes(workflow.id, input.nodes, trx);

    let transitions: Awaited<ReturnType<typeof workflowService.replaceTransitions>> = [];
    if (input.transitions && input.transitions.length > 0) {
      const nodeIdSet = new Set(nodes.map((n) => n.id));
      validateTransitions(input.transitions, nodeIdSet);
      transitions = await workflowService.replaceTransitions(workflow.id, input.transitions, trx);
    }

    const rulesByTransition =
      transitions.length > 0
        ? await workflowService.listRulesByTransitions(
            transitions.map((t) => t.id),
            trx
          )
        : new Map();

    return toWorkflowView(workflow, nodes, transitions, rulesByTransition);
  });
}
