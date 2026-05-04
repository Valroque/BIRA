import * as workflowService from '../../services/workflowService.js';
import { toWorkflowView, type WorkflowView } from './workflowView.js';

/**
 * List workflows in the workspace, fully decorated. Issues exactly four
 * queries regardless of count: workflows, nodes, transitions, rules.
 */
export async function listWorkflows(workspaceId: string): Promise<WorkflowView[]> {
  const workflows = await workflowService.listByWorkspace(workspaceId);
  if (workflows.length === 0) return [];

  const ids = workflows.map((w) => w.id);
  const [nodesByWorkflow, transitionsByWorkflow] = await Promise.all([
    workflowService.listNodesByWorkflows(ids),
    workflowService.listTransitionsByWorkflows(ids),
  ]);

  const allTransitionIds = [...transitionsByWorkflow.values()].flat().map((t) => t.id);
  const rulesByTransition =
    allTransitionIds.length > 0
      ? await workflowService.listRulesByTransitions(allTransitionIds)
      : new Map();

  return workflows.map((w) =>
    toWorkflowView(
      w,
      nodesByWorkflow.get(w.id) ?? [],
      transitionsByWorkflow.get(w.id) ?? [],
      rulesByTransition
    )
  );
}
