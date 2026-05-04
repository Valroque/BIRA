import * as issueService from '../../services/issueService.js';
import * as themeService from '../../services/themeService.js';
import * as issueLinksService from '../../services/issueLinksService.js';
import type { Issue } from '../../entities/Issue.js';

/**
 * API-shape view of an issue. Slices contributing fields:
 *   slice 1 → core fields on Issue
 *   slice 2 → parent / children
 *   slice 6 → startDate / endDate / estimate (already on Issue)
 *   slice 7 → themes (theme ids)
 *   slice 8 → relatedTo / dependsOn / dependedOnBy (issue keys)
 *
 * `parent` and `children` are issue KEYS (e.g. 'CMT-7'); `themes` are
 * theme UUIDs (themes have no slug in v1).
 */
export interface IssueView extends Issue {
  parent: string | null;
  children: string[];
  themes: string[];
  relatedTo: string[];
  dependsOn: string[];
  dependedOnBy: string[];
}

function toView(
  issue: Issue,
  parentKey: string | null,
  childKeys: string[],
  themeIds: string[],
  relatedKeys: string[],
  dependsOnKeys: string[],
  dependedOnByKeys: string[]
): IssueView {
  return Object.assign(Object.create(Object.getPrototypeOf(issue)), issue, {
    parent: parentKey,
    children: childKeys,
    themes: themeIds,
    relatedTo: relatedKeys,
    dependsOn: dependsOnKeys,
    dependedOnBy: dependedOnByKeys,
  });
}

export async function getIssue(workspaceId: string, key: string): Promise<IssueView | null> {
  const issue = await issueService.findByKey(workspaceId, key);
  if (!issue) return null;

  const [
    childIds,
    parentKeyOrNull,
    themesByIssue,
    relatedIds,
    dependsOnIds,
    dependedOnByIds,
  ] = await Promise.all([
    issueService.findChildrenIds(issue.id),
    issue.parentIssueId
      ? issueService.findKeysByIds([issue.parentIssueId]).then((m) => m.get(issue.parentIssueId!) ?? null)
      : Promise.resolve<string | null>(null),
    themeService.findThemeIdsForIssues([issue.id]),
    issueLinksService.findRelatedIdsByIssue(issue.id),
    issueLinksService.findDependsOn(issue.id),
    issueLinksService.findDependedOnBy(issue.id),
  ]);

  // Resolve every uuid we need into keys in one batch.
  const allLinkedIds = Array.from(
    new Set([...childIds, ...relatedIds, ...dependsOnIds, ...dependedOnByIds])
  );
  const keyMap = await issueService.findKeysByIds(allLinkedIds);

  const childKeys = childIds.map((id) => keyMap.get(id)).filter((k): k is string => Boolean(k));
  const relatedKeys = relatedIds
    .map((id) => keyMap.get(id))
    .filter((k): k is string => Boolean(k))
    .sort();
  const dependsOnKeys = dependsOnIds
    .map((id) => keyMap.get(id))
    .filter((k): k is string => Boolean(k))
    .sort();
  const dependedOnByKeys = dependedOnByIds
    .map((id) => keyMap.get(id))
    .filter((k): k is string => Boolean(k))
    .sort();

  const themes = themesByIssue.get(issue.id) ?? [];

  return toView(
    issue,
    parentKeyOrNull,
    childKeys,
    themes,
    relatedKeys,
    dependsOnKeys,
    dependedOnByKeys
  );
}
