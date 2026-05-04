import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authorize, resolveWorkspaceScope } from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { listWorkspaces } from '../usecases/workspaces/listWorkspaces.js';
import { createWorkspace } from '../usecases/workspaces/createWorkspace.js';

// mergeParams: parent router (tenants.ts) holds :tenantSlug — this router
// needs it for the workspace-detail handler.
const router: Router = Router({ mergeParams: true });

const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Slug must be lowercase a-z, 0-9, dashes');

const CreateWorkspaceSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
  letter: z.string().min(1).max(4),
  color: z.string().min(1).max(16),
  bg: z.string().min(1).max(16),
});

// GET /api/tenants/:tenantSlug/workspaces
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope) throw new AppError('Scope missing', 500);
    const items = await listWorkspaces(req.user.id, req.scope.tenantId, req.scope.role);
    res.json({ success: true, data: items });
  })
);

// POST /api/tenants/:tenantSlug/workspaces — admin only at the tenant level.
router.post(
  '/',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new AppError('Scope missing', 500);
    const input = CreateWorkspaceSchema.parse(req.body);
    const workspace = await createWorkspace({ ...input, tenantId: req.scope.tenantId });
    res.status(201).json({ success: true, data: workspace });
  })
);

// GET /api/tenants/:tenantSlug/workspaces/:workspaceSlug
router.get(
  '/:workspaceSlug',
  resolveWorkspaceScope,
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new AppError('Scope missing', 500);
    res.json({
      success: true,
      data: {
        id: req.scope.workspaceId,
        slug: req.scope.workspaceSlug,
        tenantId: req.scope.tenantId,
        role: req.scope.role,
      },
    });
  })
);

export default router;
