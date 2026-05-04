import { AppError } from '../../lib/errors.js';
import * as issueService from '../../services/issueService.js';
import type { Issue } from '../../entities/Issue.js';
import { parentIsRequired, validateParentAssignment } from './hierarchyRules.js';

export interface SetIssueParentInput {
  workspaceId: string;
  issueId: string;
  parentIssueId: string | null;
}

/**
 * Single source of truth for hierarchy mutations. Validates the type
 * matrix, project / workspace scope, self-parent, and cycles, then
 * persists `parent_issue_id`.
 *
 * Clearing the parent of a Story is rejected — Stories must have an
 * Epic parent. Clearing on Task / Bug is allowed (orphan leaves are
 * valid). Clearing on Epic is a noop (Epics never have a parent).
 */
export async function setIssueParent(input: SetIssueParentInput): Promise<Issue> {
  const issue = await issueService.getById(input.issueId);
  if (!issue || issue.workspaceId !== input.workspaceId) {
    throw new AppError('Issue not found', 404);
  }

  if (input.parentIssueId === null) {
    if (parentIsRequired(issue.type)) {
      throw new AppError('Stories must have an Epic parent', 400);
    }
    if (issue.parentIssueId === null) {
      // Already orphan / Epic — noop, return current.
      return issue;
    }
    const updated = await issueService.updateById(issue.id, { parentIssueId: null });
    if (!updated) throw new AppError('Issue not found', 404);
    return updated;
  }

  await validateParentAssignment({
    childIssueId: issue.id,
    childType: issue.type,
    parentIssueId: input.parentIssueId,
    workspaceId: input.workspaceId,
    projectId: issue.projectId,
  });

  const updated = await issueService.updateById(issue.id, {
    parentIssueId: input.parentIssueId,
  });
  if (!updated) throw new AppError('Issue not found', 404);
  return updated;
}
