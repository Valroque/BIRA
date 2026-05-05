/**
 * Workspace-scoped comment routes.
 *
 * Mounted at /api/tenants/:t/workspaces/:w/comments in tenants.ts.
 * These endpoints only need a comment uuid + workspace scope — no project
 * slug required. The GET and POST for a specific issue live in
 * projectIssues.ts under /:key/comments.
 *
 * Auth chain (applied in tenants.ts before mounting):
 *   authenticate → requirePasswordResetCleared → resolveTenantScope
 *   → resolveWorkspaceScope
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  authorize,
  requireActiveTenant,
  requireActiveWorkspace,
} from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { updateComment } from '../usecases/comments/updateComment.js';
import { deleteComment } from '../usecases/comments/deleteComment.js';

// mergeParams: true so :tenantSlug / :workspaceSlug are visible from the
// parent tenants.ts router.
const router: Router = Router({ mergeParams: true });

// `attachment:<uuid>` format check used in Zod schemas.
const AttachmentRefSchema = z
  .string()
  .regex(/^attachment:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Must be an attachment:<uuid> ref',
  });

const UpdateCommentSchema = z
  .object({
    body: z.string().min(1).max(50_000).optional(),
    attachmentIds: z.array(AttachmentRefSchema).max(10).optional(),
  })
  .refine((p) => p.body !== undefined || p.attachmentIds !== undefined, {
    message: 'At least one of body or attachmentIds must be provided',
  });

// PATCH /api/tenants/:t/workspaces/:w/comments/:commentId
router.patch(
  '/:commentId',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    const patch = UpdateCommentSchema.parse(req.body);
    const view = await updateComment({
      workspaceId: req.scope.workspaceId,
      commentId: req.params.commentId,
      actingUserId: req.user.id,
      actingRole: req.scope.role,
      body: patch.body,
      attachmentIds: patch.attachmentIds,
      tenantSlug: req.scope.tenantSlug,
      workspaceSlug: req.scope.workspaceSlug!,
    });
    res.json({ success: true, data: view });
  })
);

// DELETE /api/tenants/:t/workspaces/:w/comments/:commentId
router.delete(
  '/:commentId',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    await deleteComment({
      workspaceId: req.scope.workspaceId,
      commentId: req.params.commentId,
      actingUserId: req.user.id,
      actingRole: req.scope.role,
    });
    res.status(204).send();
  })
);

export default router;
