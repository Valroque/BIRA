import * as issueService from '../../services/issueService.js';
import type { Issue } from '../../entities/Issue.js';
import type { IssueFilters } from '../../services/issueService.js';
import type { IssueView } from './getIssue.js';

/**
 * Build the `IssueView` array for a list of `Issue` rows. Performs
 * exactly two extra queries regardless of result size:
 *
 *   1. children-of-parents map (one IN-clause)
 *   2. parent-key map (one IN-clause)
 *
 * No N+1 — important because list endpoints are the hot path.
 */
async function decorate(issues: Issue[]): Promise<IssueView[]> {
  if (issues.length === 0) return [];
  const issueIds = issues.map((i) => i.id);
  const parentIds = Array.from(
    new Set(issues.map((i) => i.parentIssueId).filter((v): v is string => Boolean(v)))
  );

  const [childrenMap, parentKeyMap] = await Promise.all([
    issueService.findChildrenIdsByParentIds(issueIds),
    issueService.findKeysByIds(parentIds),
  ]);

  // Need a key-of-id map for the children too (their ids aren't in
  // parentKeyMap unless they happen to also be parents). Collect all
  // child ids from the children map and resolve in a single batch.
  const allChildIds = Array.from(new Set([...childrenMap.values()].flat()));
  const childKeyMap = await issueService.findKeysByIds(allChildIds);

  return issues.map((issue) => {
    const childIds = childrenMap.get(issue.id) ?? [];
    const childKeys = childIds
      .map((id) => childKeyMap.get(id))
      .filter((k): k is string => Boolean(k));
    const parent = issue.parentIssueId ? parentKeyMap.get(issue.parentIssueId) ?? null : null;
    return Object.assign(Object.create(Object.getPrototypeOf(issue)), issue, {
      parent,
      children: childKeys,
    }) as IssueView;
  });
}

export async function listIssuesByProject(
  projectId: string,
  filters: IssueFilters = {}
): Promise<IssueView[]> {
  const items = await issueService.listByProject(projectId, filters);
  return decorate(items);
}

export async function listIssuesByWorkspace(
  workspaceId: string,
  filters: IssueFilters = {}
): Promise<IssueView[]> {
  const items = await issueService.listByWorkspace(workspaceId, filters);
  return decorate(items);
}
