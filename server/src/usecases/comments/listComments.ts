import * as commentService from '../../services/commentService.js';
import * as fileService from '../../services/fileService.js';
import { extractFileIds } from '../../lib/attachmentRefs.js';
import { toFileView } from '../files/fileView.js';
import { toCommentView, type CommentView } from './commentView.js';

/**
 * List all comments for an issue, ordered by created_at ASC.
 *
 * Attachments are expanded: each comment's `attachment_ids` refs are resolved
 * to FileViews. Dangling refs (file deleted after comment was created) are
 * silently dropped from `attachments` — the raw `attachmentIds` field is
 * still present so callers can detect the gap if needed.
 *
 * @param issueId - uuid of the issue
 * @param workspaceId - used to scope the file lookup (cross-ws refs are silently absent)
 * @param ctx - tenant/workspace slugs needed to build readUrls
 */
export async function listComments(
  issueId: string,
  workspaceId: string,
  ctx: { tenantSlug: string; workspaceSlug: string }
): Promise<CommentView[]> {
  const comments = await commentService.listByIssue(issueId);

  if (comments.length === 0) return [];

  // Collect all distinct file ids across all comments, then batch-fetch.
  const allRefs = comments.flatMap((c) => c.attachmentIds);
  const allFileIds = extractFileIds(allRefs);
  const fileEntities = await fileService.findByIdsInWorkspace(workspaceId, allFileIds);

  // Build a single id→FileView map reused across all comments.
  const attachmentMap = new Map(
    [...fileEntities.entries()].map(([id, f]) => [
      id,
      toFileView(f, { tenantSlug: ctx.tenantSlug, workspaceSlug: ctx.workspaceSlug }),
    ])
  );

  return comments.map((c) => toCommentView(c, attachmentMap));
}
