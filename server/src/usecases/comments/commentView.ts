import * as fileService from '../../services/fileService.js';
import { toFileView, type FileView } from '../files/fileView.js';
import type { Comment } from '../../entities/Comment.js';
import { parseAttachmentRef, extractFileIds } from '../../lib/attachmentRefs.js';

export interface CommentView {
  id: string;
  issueId: string;
  authorUserId: string | null;
  body: string;
  /** Raw attachment refs — `attachment:<uuid>` strings. */
  attachmentIds: string[];
  /** Expanded file views; missing/dangling refs are silently dropped. */
  attachments: FileView[];
  /** @[type:uuid] tokens extracted from the body on every write. */
  mentions: Array<{ type: string; id: string }>;
  createdAt: string;
  updatedAt: string | null;
}

/**
 * Build a CommentView from a Comment entity plus an attachment map.
 *
 * @param comment - the Comment entity
 * @param attachmentMap - map from file uuid → FileView (workspace-scoped)
 *
 * Refs that don't resolve in the map (dangling — file deleted after comment
 * was created) are silently excluded from `attachments`. The raw
 * `attachmentIds` field is preserved verbatim so callers can detect the gap
 * if needed.
 */
export function toCommentView(
  comment: Comment,
  attachmentMap: Map<string, FileView>
): CommentView {
  const attachments: FileView[] = [];
  for (const ref of comment.attachmentIds) {
    const fileId = parseAttachmentRef(ref);
    if (fileId) {
      const view = attachmentMap.get(fileId);
      if (view) attachments.push(view);
      // else: dangling ref — silently skip
    }
  }

  return {
    id: comment.id,
    issueId: comment.issueId,
    authorUserId: comment.authorUserId,
    body: comment.body,
    attachmentIds: comment.attachmentIds,
    attachments,
    mentions: comment.mentions,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

/**
 * Build a CommentView with fully expanded FileView attachments.
 * Use this from route handlers that have `tenantSlug` / `workspaceSlug`
 * available in `req.scope`.
 */
export async function expandCommentView(
  comment: Comment,
  workspaceId: string,
  ctx: { tenantSlug: string; workspaceSlug: string }
): Promise<CommentView> {
  const fileIds = extractFileIds(comment.attachmentIds);
  const fileEntities = await fileService.findByIdsInWorkspace(workspaceId, fileIds);
  const attachmentMap = new Map(
    [...fileEntities.entries()].map(([id, f]) => [
      id,
      toFileView(f, { tenantSlug: ctx.tenantSlug, workspaceSlug: ctx.workspaceSlug }),
    ])
  );
  return toCommentView(comment, attachmentMap);
}
