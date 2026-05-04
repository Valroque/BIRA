import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  authorize,
  requireActiveTenant,
  requireActiveWorkspace,
} from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { listProjects } from '../usecases/projects/listProjects.js';
import { createProject } from '../usecases/projects/createProject.js';
import * as projectService from '../services/projectService.js';
import { PROJECT_STATUSES } from '../lib/constants.js';
import projectIssuesRouter from './projectIssues.js';

const router: Router = Router({ mergeParams: true });

const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Slug must be lowercase a-z, 0-9, dashes');

const CreateProjectSchema = z.object({
  slug: slugSchema,
  key: z.string().min(1).max(8).regex(/^[A-Z0-9]+$/, 'Key must be uppercase A-Z, 0-9'),
  name: z.string().min(1).max(255),
  letter: z.string().min(1).max(4),
  color: z.string().min(1).max(16),
  bg: z.string().min(1).max(16),
  description: z.string().max(2000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
});

// GET /api/tenants/:tenantSlug/workspaces/:workspaceSlug/projects
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const items = await listProjects(req.scope.workspaceId);
    res.json({ success: true, data: items });
  })
);

// POST /api/tenants/:tenantSlug/workspaces/:workspaceSlug/projects — write+
router.post(
  '/',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    const input = CreateProjectSchema.parse(req.body);
    const project = await createProject({
      ...input,
      workspaceId: req.scope.workspaceId,
      createdByUserId: req.user.id,
    });
    res.status(201).json({ success: true, data: project });
  })
);

// GET /api/tenants/:tenantSlug/workspaces/:workspaceSlug/projects/:projectSlug
router.get(
  '/:projectSlug',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const project = await projectService.findBySlug(
      req.scope.workspaceId,
      req.params.projectSlug
    );
    if (!project) throw new AppError(`Project '${req.params.projectSlug}' not found`, 404);
    res.json({ success: true, data: project });
  })
);

// /api/tenants/:t/workspaces/:w/projects/:projectSlug/issues — issue routes
// (workspace scope is already resolved by the parent router; project lookup
// happens inside the issues router).
router.use('/:projectSlug/issues', projectIssuesRouter);

export default router;
