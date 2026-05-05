import * as issueService from '../../services/issueService.js';
import * as issueLinksService from '../../services/issueLinksService.js';
import * as fileService from '../../services/fileService.js';
import { extractFileIds, parseAttachmentRef } from '../../lib/attachmentRefs.js';
import { toFileView, type FileView } from '../files/fileView.js';
import type { Issue } from '../../entities/Issue.js';

/**
 * API-shape view of an issue. Slices contributing fields:
 *   slice 1 → core fields on Issue
 *   slice 2 → parent / children
 *   slice 6 → startDate / endDate / estimate (already on Issue)
 *   slice 8 → relatedTo / dependsOn / dependedOnBy (issue keys)
 *   slice C → descriptionAttachments (expanded FileView[])
 *
 * `parent` and `children` are issue KEYS (e.g. 'CMT-7').
 *
 * `descriptionAttachments` is expanded **only on the detail view**. List
 * endpoints (project / workspace) emit the raw `descriptionAttachmentIds`
 * (text[] of `attachment:<uuid>` refs) inherited from the Issue entity but
 * skip the FileView expansion to keep list payloads bounded — same policy
 * as `parent`/`children` keys vs. fully expanded child entities.
 */
export interface IssueView extends Issue {
  parent: string | null;
  children: string[];
  relatedTo: string[];
  dependsOn: string[];
  dependedOnBy: string[];
  // Detail-view only. List endpoints omit this field entirely (callers
  // get the raw `descriptionAttachmentIds` and can show counts / fetch
  // detail when needed). Optional in the type so list builders don't
  // have to fabricate empty arrays.
  descriptionAttachments?: FileView[];
}

function toView(
  issue: Issue,
  parentKey: string | null,
  childKeys: string[],
  relatedKeys: string[],
  dependsOnKeys: string[],
  dependedOnByKeys: string[],
  descriptionAttachments: FileView[]
): IssueView {
  return Object.assign(Object.create(Object.getPrototypeOf(issue)), issue, {
    parent: parentKey,
    children: childKeys,
    relatedTo: relatedKeys,
    dependsOn: dependsOnKeys,
    dependedOnBy: dependedOnByKeys,
    descriptionAttachments,
  });
}

export interface GetIssueContext {
  tenantSlug: string;
  workspaceSlug: string;
}

/**
 * Detail-view fetch for a single issue. Expands hierarchy + link keys
 * AND description attachment refs (slice C) into FileViews — the latter
 * needs slug context to build `readUrl`s, which is why this signature
 * carries `ctx` while the list paths don't (they don't expand
 * attachments).
 */
export async function getIssue(
  workspaceId: string,
  key: string,
  ctx: GetIssueContext
): Promise<IssueView | null> {
  const issue = await issueService.findByKey(workspaceId, key);
  if (!issue) return null;

  const descriptionFileIds = extractFileIds(issue.descriptionAttachmentIds);

  const [
    childIds,
    parentKeyOrNull,
    relatedIds,
    dependsOnIds,
    dependedOnByIds,
    descriptionFileMap,
  ] = await Promise.all([
    issueService.findChildrenIds(issue.id),
    issue.parentIssueId
      ? issueService.findKeysByIds([issue.parentIssueId]).then((m) => m.get(issue.parentIssueId!) ?? null)
      : Promise.resolve<string | null>(null),
    issueLinksService.findRelatedIdsByIssue(issue.id),
    issueLinksService.findDependsOn(issue.id),
    issueLinksService.findDependedOnBy(issue.id),
    fileService.findByIdsInWorkspace(workspaceId, descriptionFileIds),
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

  // Expand description attachment refs into FileViews. Preserve insertion
  // order (matches user intent for inline image rendering). Dangling
  // refs — file deleted after the issue was edited — silently drop from
  // the expanded list; the raw `descriptionAttachmentIds` array on the
  // entity still holds them so callers can detect the gap.
  const descriptionAttachments: FileView[] = [];
  for (const ref of issue.descriptionAttachmentIds) {
    const fileId = parseAttachmentRef(ref);
    if (!fileId) continue;
    const file = descriptionFileMap.get(fileId);
    if (!file) continue;
    descriptionAttachments.push(
      toFileView(file, { tenantSlug: ctx.tenantSlug, workspaceSlug: ctx.workspaceSlug })
    );
  }

  return toView(
    issue,
    parentKeyOrNull,
    childKeys,
    relatedKeys,
    dependsOnKeys,
    dependedOnByKeys,
    descriptionAttachments
  );
}
