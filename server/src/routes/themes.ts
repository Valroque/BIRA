import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  authorize,
  requireActiveTenant,
  requireActiveWorkspace,
} from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { createTheme } from '../usecases/themes/createTheme.js';
import { getTheme } from '../usecases/themes/getTheme.js';
import { listThemes } from '../usecases/themes/listThemes.js';
import { updateTheme } from '../usecases/themes/updateTheme.js';
import { deleteTheme } from '../usecases/themes/deleteTheme.js';
import { attachThemeToIssue } from '../usecases/themes/attachThemeToIssue.js';
import { detachThemeFromIssue } from '../usecases/themes/detachThemeFromIssue.js';

const router: Router = Router({ mergeParams: true });

const ISSUE_KEY_RE = /^[A-Z0-9]+-\d+$/;

const CreateThemeSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  color: z.string().min(1).max(16).optional(),
});

const UpdateThemeSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).nullable().optional(),
    color: z.string().min(1).max(16).optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const items = await listThemes(req.scope.workspaceId);
    res.json({ success: true, data: items });
  })
);

router.post(
  '/',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const input = CreateThemeSchema.parse(req.body);
    const view = await createTheme({ ...input, workspaceId: req.scope.workspaceId });
    res.status(201).json({ success: true, data: view });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const view = await getTheme(req.scope.workspaceId, req.params.id);
    if (!view) throw new AppError('Theme not found', 404);
    res.json({ success: true, data: view });
  })
);

router.patch(
  '/:id',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const patch = UpdateThemeSchema.parse(req.body);
    const view = await updateTheme(req.scope.workspaceId, req.params.id, patch);
    res.json({ success: true, data: view });
  })
);

router.delete(
  '/:id',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    await deleteTheme(req.scope.workspaceId, req.params.id);
    res.status(204).end();
  })
);

router.post(
  '/:id/issues/:issueKey',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    if (!ISSUE_KEY_RE.test(req.params.issueKey)) {
      throw new AppError('Invalid issue key', 400);
    }
    await attachThemeToIssue({
      workspaceId: req.scope.workspaceId,
      themeId: req.params.id,
      issueKey: req.params.issueKey,
    });
    res.status(204).end();
  })
);

router.delete(
  '/:id/issues/:issueKey',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    if (!ISSUE_KEY_RE.test(req.params.issueKey)) {
      throw new AppError('Invalid issue key', 400);
    }
    await detachThemeFromIssue({
      workspaceId: req.scope.workspaceId,
      themeId: req.params.id,
      issueKey: req.params.issueKey,
    });
    res.status(204).end();
  })
);

export default router;
