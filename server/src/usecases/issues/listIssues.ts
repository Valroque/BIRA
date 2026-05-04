import * as issueService from '../../services/issueService.js';
import * as themeService from '../../services/themeService.js';
import * as issueLinksService from '../../services/issueLinksService.js';
import type { Issue } from '../../entities/Issue.js';
import type { IssueFilters } from '../../services/issueService.js';
import type { IssueView } from './getIssue.js';

/**
 * Build the `IssueView` array for a list of `Issue` rows. Performs a
 * fixed number of extra queries regardless of result size:
 *
 *   1. children-of-parents map
 *   2. parent-key map
 *   3. theme-ids-by-issue map
 *   4. relates-by-issue map (one query, both directions)
 *   5. dependsOn-by-issue map
 *   6. dependedOnBy-by-issue map
 *   7. final batched key resolution for relates/depends ids
 *
 * No N+1 — important because list endpoints are the hot path.
 */
async function decorate(issues: Issue[]): Promise<IssueView[]> {
  if (issues.length === 0) return [];
  const issueIds = issues.map((i) => i.id);
  const parentIds = Array.from(
    new Set(issues.map((i) => i.parentIssueId).filter((v): v is string => Boolean(v)))
  );

  const [
    childrenMap,
    parentKeyMap,
    themesByIssue,
    relatesByIssue,
    dependsOnByIssue,
    dependedOnByByIssue,
  ] = await Promise.all([
    issueService.findChildrenIdsByParentIds(issueIds),
    issueService.findKeysByIds(parentIds),
    themeService.findThemeIdsForIssues(issueIds),
    issueLinksService.findRelatedIdsByIssues(issueIds),
    issueLinksService.findDependsOnByIssues(issueIds),
    issueLinksService.findDependedOnByByIssues(issueIds),
  ]);

  // Collect every linked uuid that isn't already in the page so we can
  // resolve them to keys in one IN clause.
  const linkedIds = new Set<string>();
  for (const arr of childrenMap.values()) for (const id of arr) linkedIds.add(id);
  for (const arr of relatesByIssue.values()) for (const id of arr) linkedIds.add(id);
  for (const arr of dependsOnByIssue.values()) for (const id of arr) linkedIds.add(id);
  for (const arr of dependedOnByByIssue.values()) for (const id of arr) linkedIds.add(id);
  const linkedKeyMap = await issueService.findKeysByIds(Array.from(linkedIds));

  return issues.map((issue) => {
    const childIds = childrenMap.get(issue.id) ?? [];
    const childKeys = childIds.map((id) => linkedKeyMap.get(id)).filter((k): k is string => Boolean(k));
    const parent = issue.parentIssueId ? parentKeyMap.get(issue.parentIssueId) ?? null : null;
    const relatedKeys = (relatesByIssue.get(issue.id) ?? [])
      .map((id) => linkedKeyMap.get(id))
      .filter((k): k is string => Boolean(k))
      .sort();
    const dependsOnKeys = (dependsOnByIssue.get(issue.id) ?? [])
      .map((id) => linkedKeyMap.get(id))
      .filter((k): k is string => Boolean(k))
      .sort();
    const dependedOnByKeys = (dependedOnByByIssue.get(issue.id) ?? [])
      .map((id) => linkedKeyMap.get(id))
      .filter((k): k is string => Boolean(k))
      .sort();
    const themes = themesByIssue.get(issue.id) ?? [];

    return Object.assign(Object.create(Object.getPrototypeOf(issue)), issue, {
      parent,
      children: childKeys,
      themes,
      relatedTo: relatedKeys,
      dependsOn: dependsOnKeys,
      dependedOnBy: dependedOnByKeys,
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
