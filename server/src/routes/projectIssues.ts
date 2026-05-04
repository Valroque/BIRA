import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  authorize,
  requireActiveTenant,
  requireActiveWorkspace,
} from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import * as projectService from '../services/projectService.js';
import { createIssue } from '../usecases/issues/createIssue.js';
import { getIssue } from '../usecases/issues/getIssue.js';
import { listIssuesByProject } from '../usecases/issues/listIssues.js';
import { updateIssue } from '../usecases/issues/updateIssue.js';
import { ISSUE_TYPES, STATUSES, PRIORITIES } from '../lib/constants.js';

// mergeParams: parent (tenants.ts → workspaces/:w/projects/:projectSlug)
// holds :tenantSlug, :workspaceSlug, :projectSlug — all needed here.
const router: Router = Router({ mergeParams: true });

const CreateIssueSchema = z.object({
  type: z.enum(ISSUE_TYPES),
  title: z.string().min(1).max(500),
  description: z.string().max(50_000).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  labels: z.array(z.string().min(1).max(64)).max(64).optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
});

const UpdateIssueSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(50_000).nullable().optional(),
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
    labels: z.array(z.string().min(1).max(64)).max(64).optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

const ListIssuesQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  type: z.enum(ISSUE_TYPES).optional(),
  assigneeUserId: z.string().uuid().optional(),
  label: z.string().min(1).max(64).optional(),
  priority: z.enum(PRIORITIES).optional(),
});

async function resolveProject(req: { scope?: { workspaceId?: string }; params: { projectSlug?: string } }) {
  if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
  const slug = req.params.projectSlug;
  if (!slug) throw new AppError('Project slug missing in URL', 400);
  const project = await projectService.findBySlug(req.scope.workspaceId, slug);
  if (!project) throw new AppError(`Project '${slug}' not found`, 404);
  return project;
}

// GET /api/tenants/:t/workspaces/:w/projects/:projectSlug/issues
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const project = await resolveProject(req);
    const filters = ListIssuesQuerySchema.parse(req.query);
    const items = await listIssuesByProject(project.id, filters);
    res.json({ success: true, data: items });
  })
);

// POST /api/tenants/:t/workspaces/:w/projects/:projectSlug/issues
router.post(
  '/',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    const project = await resolveProject(req);
    const input = CreateIssueSchema.parse(req.body);
    const issue = await createIssue({
      ...input,
      workspaceId: req.scope.workspaceId,
      projectId: project.id,
      reporterUserId: req.user.id,
    });
    res.status(201).json({ success: true, data: issue });
  })
);

// GET /api/tenants/:t/workspaces/:w/projects/:projectSlug/issues/:key
router.get(
  '/:key',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    // Confirm the project exists (and belongs to this workspace) so a
    // bogus :projectSlug 404s the way callers expect, even if the key
    // lookup itself is workspace-scoped.
    await resolveProject(req);
    const issue = await getIssue(req.scope.workspaceId, req.params.key);
    if (!issue) throw new AppError(`Issue '${req.params.key}' not found`, 404);
    res.json({ success: true, data: issue });
  })
);

// PATCH /api/tenants/:t/workspaces/:w/projects/:projectSlug/issues/:key
router.patch(
  '/:key',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    await resolveProject(req);
    const patch = UpdateIssueSchema.parse(req.body);
    const issue = await updateIssue(req.scope.workspaceId, req.params.key, patch);
    res.json({ success: true, data: issue });
  })
);

export default router;
