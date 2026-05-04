import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import * as workflowService from '../../services/workflowService.js';
import type {
  WorkflowNodeInput,
  WorkflowTransitionInput,
} from '../../services/workflowService.js';
import { toWorkflowView, type WorkflowView } from './workflowView.js';
import { validateNodes, validateTransitions } from './validators.js';

export interface UpdateWorkflowInput {
  name?: string;
  description?: string | null;
  /**
   * Full-replace semantics — when present, the existing node set is
   * dropped and replaced atomically. Cascades through transitions /
   * rules via FK ON DELETE CASCADE.
   */
  nodes?: WorkflowNodeInput[];
  /**
   * Full-replace semantics — same shape as create.
   */
  transitions?: WorkflowTransitionInput[];
}

export async function updateWorkflow(
  workspaceId: string,
  slug: string,
  patch: UpdateWorkflowInput
): Promise<WorkflowView> {
  const provided = Object.keys(patch).filter(
    (k) => (patch as Record<string, unknown>)[k] !== undefined
  );
  if (provided.length === 0) {
    throw new AppError('At least one field must be provided', 400);
  }
  if (patch.nodes !== undefined) validateNodes(patch.nodes);

  return db.transaction(async (trx) => {
    const workflow = await workflowService.findBySlug(workspaceId, slug, trx);
    if (!workflow) throw new AppError(`Workflow '${slug}' not found`, 404);

    if (patch.name !== undefined || patch.description !== undefined) {
      await workflowService.updateById(
        workflow.id,
        {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
        },
        trx
      );
    }

    let nodes = await workflowService.listNodesByWorkflow(workflow.id, trx);
    if (patch.nodes !== undefined) {
      nodes = await workflowService.replaceNodes(workflow.id, patch.nodes, trx);
    }

    let transitions = await workflowService.listTransitionsByWorkflow(workflow.id, trx);
    // If nodes were replaced, the old transitions cascaded away too; we
    // need to either re-insert from the patch or accept zero. If only
    // transitions are being patched (nodes unchanged), the existing node
    // ids are still valid.
    if (patch.transitions !== undefined) {
      const nodeIdSet = new Set(nodes.map((n) => n.id));
      validateTransitions(patch.transitions, nodeIdSet);
      transitions = await workflowService.replaceTransitions(
        workflow.id,
        patch.transitions,
        trx
      );
    } else if (patch.nodes !== undefined) {
      // Nodes replaced without transitions in the patch — the old ones
      // cascaded away; reflect that in the response.
      transitions = [];
    }

    const rulesByTransition =
      transitions.length > 0
        ? await workflowService.listRulesByTransitions(
            transitions.map((t) => t.id),
            trx
          )
        : new Map();

    const refreshed = await workflowService.getById(workflow.id, trx);
    if (!refreshed) throw new AppError('Workflow disappeared during update', 500);

    return toWorkflowView(refreshed, nodes, transitions, rulesByTransition);
  });
}
