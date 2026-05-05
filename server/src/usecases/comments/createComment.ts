import * as commentService from '../../services/commentService.js';
import { validateAttachmentRefs } from '../../lib/validateAttachmentRefs.js';
import { parseMentions } from '../../lib/parseMentions.js';
import { AppError } from '../../lib/errors.js';
import type { Comment } from '../../entities/Comment.js';

const MAX_BODY = 50_000;
const MAX_ATTACHMENTS = 10;

export interface CreateCommentInput {
  workspaceId: string;
  tenantId: string;
  issueId: string;
  authorUserId: string;
  body: string;
  attachmentIds?: string[];
}

/**
 * Create a comment on an issue.
 *
 * Returns the raw Comment entity; the route layer expands attachment refs
 * into FileViews using `expandCommentView` (which needs slug context from
 * `req.scope`).
 */
export async function createComment(input: CreateCommentInput): Promise<Comment> {
  const { workspaceId, tenantId, issueId, authorUserId, body } = input;
  const attachmentIds = input.attachmentIds ?? [];

  if (!body || body.length === 0) {
    throw new AppError('body is required', 400);
  }
  if (body.length > MAX_BODY) {
    throw new AppError(`body must be at most ${MAX_BODY} characters`, 400);
  }
  if (attachmentIds.length > MAX_ATTACHMENTS) {
    throw new AppError(`at most ${MAX_ATTACHMENTS} attachments are allowed per comment`, 400);
  }

  if (attachmentIds.length > 0) {
    await validateAttachmentRefs(workspaceId, attachmentIds);
  }

  const mentions = parseMentions(body);
  return commentService.create({
    tenantId,
    workspaceId,
    issueId,
    authorUserId,
    body,
    attachmentIds,
    mentions,
  });
}
