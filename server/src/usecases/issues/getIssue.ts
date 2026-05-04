import * as issueService from '../../services/issueService.js';
import type { Issue } from '../../entities/Issue.js';

/**
 * API-shape view of an issue. Slice 2 adds `parent` and `children` —
 * both expressed as issue keys (e.g. `'CMT-7'`) so the FE never sees
 * raw uuids for issues. Internal storage is uuid-based; we resolve
 * to keys at this seam.
 */
export interface IssueView extends Issue {
  parent: string | null;
  children: string[];
}

function toView(issue: Issue, parentKey: string | null, childKeys: string[]): IssueView {
  // We spread the entity; the entity's own `parentIssueId` (uuid)
  // stays on the response too — the brief asks for `parent` (key)
  // to be present, and `parentIssueId` is harmless to keep alongside
  // for now. If we want to strip it later we can map fields explicitly.
  return Object.assign(Object.create(Object.getPrototypeOf(issue)), issue, {
    parent: parentKey,
    children: childKeys,
  });
}

export async function getIssue(workspaceId: string, key: string): Promise<IssueView | null> {
  const issue = await issueService.findByKey(workspaceId, key);
  if (!issue) return null;

  const [childIds, parentKey] = await Promise.all([
    issueService.findChildrenIds(issue.id),
    issue.parentIssueId
      ? issueService.findKeysByIds([issue.parentIssueId]).then((m) => m.get(issue.parentIssueId!) ?? null)
      : Promise.resolve<string | null>(null),
  ]);

  // Resolve child uuids back to keys, preserving the seq order
  // returned by findChildrenIds.
  const childKeyMap = await issueService.findKeysByIds(childIds);
  const childKeys = childIds
    .map((id) => childKeyMap.get(id))
    .filter((k): k is string => Boolean(k));

  return toView(issue, parentKey, childKeys);
}
