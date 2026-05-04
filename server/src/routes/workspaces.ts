import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  authorize,
  requireActiveTenant,
  resolveWorkspaceScope,
} from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { roleAtLeast } from '../lib/constants.js';
import * as workspaceService from '../services/workspaceService.js';
import { listWorkspaces } from '../usecases/workspaces/listWorkspaces.js';
import { createWorkspace } from '../usecases/workspaces/createWorkspace.js';
import { updateWorkspace } from '../usecases/workspaces/updateWorkspace.js';
import { setWorkspaceStatus } from '../usecases/workspaces/setWorkspaceStatus.js';

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

// Slug is intentionally NOT updatable — it's load-bearing in URLs and in
// the FE's tenant+workspace-keyed localStorage entries. Renaming a slug is
// a separate migration story.
const UpdateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    letter: z.string().min(1).max(4).optional(),
    color: z.string().min(1).max(16).optional(),
    bg: z.string().min(1).max(16).optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

// GET /api/tenants/:tenantSlug/workspaces?includeArchived=true
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope) throw new AppError('Scope missing', 500);
    const includeArchived = req.query.includeArchived === 'true';
    const items = await listWorkspaces(req.user.id, req.scope.tenantId, req.scope.role, {
      includeArchived,
    });
    res.json({ success: true, data: items });
  })
);

// POST /api/tenants/:tenantSlug/workspaces — admin only at the tenant level.
router.post(
  '/',
  authorize('admin'),
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new AppError('Scope missing', 500);
    const input = CreateWorkspaceSchema.parse(req.body);
    const workspace = await createWorkspace({ ...input, tenantId: req.scope.tenantId });
    res.status(201).json({ success: true, data: workspace });
  })
);

// GET /api/tenants/:tenantSlug/workspaces/:workspaceSlug?includeArchived=true
//
// Default behaviour mirrors the list endpoint: archived workspaces are
// hidden (404) unless the caller explicitly opts in with
// `?includeArchived=true`. Mutation paths (PATCH, archive/unarchive) are
// always allowed to look up an archived workspace — only this read-side
// detail returns 404, so a stale FE bookmark to an archived workspace
// fails fast instead of silently rendering frozen state.
router.get(
  '/:workspaceSlug',
  resolveWorkspaceScope,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Scope missing', 500);
    const includeArchived = req.query.includeArchived === 'true';
    if (req.scope.workspaceStatus === 'archived' && !includeArchived) {
      throw new AppError(
        `Workspace '${req.scope.workspaceSlug}' is archived — pass ?includeArchived=true to view it`,
        404
      );
    }
    const workspace = await workspaceService.getById(req.scope.workspaceId);
    if (!workspace) throw new AppError('Workspace not found', 404);
    res.json({
      success: true,
      data: { workspace, role: req.scope.role },
    });
  })
);

// PATCH /api/tenants/:tenantSlug/workspaces/:workspaceSlug — workspace admin
// (effective role, so tenant admins are covered too via the tenant-admin-wins
// rule in resolveWorkspaceScope).
router.patch(
  '/:workspaceSlug',
  resolveWorkspaceScope,
  authorize('admin'),
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Scope missing', 500);
    const patch = UpdateWorkspaceSchema.parse(req.body);
    const workspace = await updateWorkspace({
      workspaceId: req.scope.workspaceId,
      patch,
    });
    res.json({ success: true, data: workspace });
  })
);

// POST /api/tenants/:tenantSlug/workspaces/:workspaceSlug/archive — tenant
// admin only. Archive is a structural change that ripples through every
// project + future write surface in the workspace, so the gate sits at the
// tenant level intentionally — workspace admins can rename their workspace
// (PATCH above) but cannot freeze it.
router.post(
  '/:workspaceSlug/archive',
  resolveWorkspaceScope,
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Scope missing', 500);
    if (!roleAtLeast(req.scope.tenantRole, 'admin')) {
      throw new AppError('Only tenant admins can archive a workspace', 403);
    }
    const workspace = await setWorkspaceStatus(req.scope.workspaceId, 'archived');
    res.json({ success: true, data: workspace });
  })
);

// POST /api/tenants/:tenantSlug/workspaces/:workspaceSlug/unarchive — tenant
// admin only, mirroring archive.
router.post(
  '/:workspaceSlug/unarchive',
  resolveWorkspaceScope,
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Scope missing', 500);
    if (!roleAtLeast(req.scope.tenantRole, 'admin')) {
      throw new AppError('Only tenant admins can unarchive a workspace', 403);
    }
    const workspace = await setWorkspaceStatus(req.scope.workspaceId, 'active');
    res.json({ success: true, data: workspace });
  })
);

export default router;
