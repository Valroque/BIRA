import { AppError } from '../../lib/errors.js';
import * as projectWorkflowService from '../../services/projectWorkflowService.js';
import * as projectService from '../../services/projectService.js';
import * as workflowService from '../../services/workflowService.js';
import { ISSUE_TYPES, type IssueType } from '../../lib/constants.js';

export interface SetProjectWorkflowInput {
  workspaceId: string;
  projectId: string;
  issueType: IssueType;
  workflowSlug: string;
}

/**
 * Assign / reassign the workflow used by `(projectId, issueType)`. The
 * workflow MUST live in the same workspace as the project — otherwise
 * we'd leak workflows across workspace boundaries.
 */
export async function setProjectWorkflow(input: SetProjectWorkflowInput): Promise<void> {
  if (!ISSUE_TYPES.includes(input.issueType)) {
    throw new AppError(`Invalid issue type '${input.issueType}'`, 400);
  }

  const project = await projectService.getById(input.projectId);
  if (!project || project.workspaceId !== input.workspaceId) {
    // No information leak — same wording for cross-workspace as for
    // missing.
    throw new AppError('Project not found', 404);
  }

  const workflow = await workflowService.findBySlug(input.workspaceId, input.workflowSlug);
  if (!workflow) {
    throw new AppError(`Workflow '${input.workflowSlug}' not found in this workspace`, 400);
  }

  await projectWorkflowService.upsert(input.projectId, input.issueType, workflow.id);
}
