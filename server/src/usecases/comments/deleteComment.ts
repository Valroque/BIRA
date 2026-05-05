import * as commentService from '../../services/commentService.js';
import { AppError } from '../../lib/errors.js';

export interface DeleteCommentInput {
  workspaceId: string;
  commentId: string;
  actingUserId: string;
  actingRole: string;
}

/**
 * Hard-delete a comment. Does NOT delete referenced files — files are
 * independent and may be referenced elsewhere.
 */
export async function deleteComment(input: DeleteCommentInput): Promise<void> {
  const { workspaceId, commentId, actingUserId, actingRole } = input;

  const comment = await commentService.findByWorkspaceAndId(workspaceId, commentId);
  if (!comment) throw new AppError(`Comment '${commentId}' not found`, 404);

  // Authorization: author or workspace admin.
  if (comment.authorUserId !== actingUserId && actingRole !== 'admin') {
    throw new AppError('Forbidden: only the author or a workspace admin can delete this comment', 403);
  }

  await commentService.deleteById(commentId);
}
