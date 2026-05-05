import * as commentService from '../../services/commentService.js';
import * as fileService from '../../services/fileService.js';
import { validateAttachmentRefs } from '../../lib/validateAttachmentRefs.js';
import { extractFileIds } from '../../lib/attachmentRefs.js';
import { parseMentions } from '../../lib/parseMentions.js';
import { AppError } from '../../lib/errors.js';
import { toFileView } from '../files/fileView.js';
import { toCommentView, type CommentView } from './commentView.js';

const MAX_BODY = 50_000;
const MAX_ATTACHMENTS = 10;

export interface UpdateCommentInput {
  workspaceId: string;
  commentId: string;
  actingUserId: string;
  actingRole: string;
  body?: string;
  attachmentIds?: string[];
  // Slug context for readUrl expansion.
  tenantSlug: string;
  workspaceSlug: string;
}

export async function updateComment(input: UpdateCommentInput): Promise<CommentView> {
  const {
    workspaceId,
    commentId,
    actingUserId,
    actingRole,
    tenantSlug,
    workspaceSlug,
  } = input;

  const comment = await commentService.findByWorkspaceAndId(workspaceId, commentId);
  if (!comment) throw new AppError(`Comment '${commentId}' not found`, 404);

  // Authorization: author or workspace admin.
  if (comment.authorUserId !== actingUserId && actingRole !== 'admin') {
    throw new AppError('Forbidden: only the author or a workspace admin can edit this comment', 403);
  }

  if (input.body === undefined && input.attachmentIds === undefined) {
    throw new AppError('At least one of body or attachmentIds must be provided', 400);
  }

  if (input.body !== undefined) {
    if (input.body.length === 0) {
      throw new AppError('body must be non-empty', 400);
    }
    if (input.body.length > MAX_BODY) {
      throw new AppError(`body must be at most ${MAX_BODY} characters`, 400);
    }
  }

  if (input.attachmentIds !== undefined) {
    if (input.attachmentIds.length > MAX_ATTACHMENTS) {
      throw new AppError(`at most ${MAX_ATTACHMENTS} attachments are allowed per comment`, 400);
    }
    if (input.attachmentIds.length > 0) {
      await validateAttachmentRefs(workspaceId, input.attachmentIds);
    }
  }

  const patch: commentService.UpdateCommentInput = {};
  if (input.body !== undefined) patch.body = input.body;
  if (input.attachmentIds !== undefined) patch.attachmentIds = input.attachmentIds;
  if (input.body !== undefined) patch.mentions = parseMentions(input.body);

  const updated = await commentService.update(commentId, patch);

  // Expand attachments for the returned view.
  const fileIds = extractFileIds(updated.attachmentIds);
  const fileEntities = await fileService.findByIdsInWorkspace(workspaceId, fileIds);
  const attachmentMap = new Map(
    [...fileEntities.entries()].map(([id, f]) => [
      id,
      toFileView(f, { tenantSlug, workspaceSlug }),
    ])
  );

  return toCommentView(updated, attachmentMap);
}
