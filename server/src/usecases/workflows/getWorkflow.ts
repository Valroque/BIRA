import * as workflowService from '../../services/workflowService.js';
import { toWorkflowView, type WorkflowView } from './workflowView.js';

export async function getWorkflow(
  workspaceId: string,
  slug: string
): Promise<WorkflowView | null> {
  const workflow = await workflowService.findBySlug(workspaceId, slug);
  if (!workflow) return null;

  const [nodes, transitions] = await Promise.all([
    workflowService.listNodesByWorkflow(workflow.id),
    workflowService.listTransitionsByWorkflow(workflow.id),
  ]);

  const rulesByTransition =
    transitions.length > 0
      ? await workflowService.listRulesByTransitions(transitions.map((t) => t.id))
      : new Map();

  return toWorkflowView(workflow, nodes, transitions, rulesByTransition);
}
