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
import { createMilestone } from '../usecases/milestones/createMilestone.js';
import { getMilestone } from '../usecases/milestones/getMilestone.js';
import { listMilestonesByProject } from '../usecases/milestones/listMilestones.js';
import { updateMilestone } from '../usecases/milestones/updateMilestone.js';
import { deleteMilestone } from '../usecases/milestones/deleteMilestone.js';

// mergeParams: parent (projects.ts) holds :tenantSlug, :workspaceSlug,
// :projectSlug — all three are needed inside this router.
const router: Router = Router({ mergeParams: true });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const CreateMilestoneSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  date: z.string().regex(ISO_DATE),
});

const UpdateMilestoneSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    date: z.string().regex(ISO_DATE).optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

const IdParamSchema = z.string().uuid();

async function resolveProject(req: {
  scope?: { workspaceId?: string };
  params: { projectSlug?: string };
}) {
  if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
  const slug = req.params.projectSlug;
  if (!slug) throw new AppError('Project slug missing in URL', 400);
  const project = await projectService.findBySlug(req.scope.workspaceId, slug);
  if (!project) throw new AppError(`Project '${slug}' not found`, 404);
  return project;
}

/**
 * Gate write paths on project status. Mirrors `requireActiveWorkspace`
 * but at the project scope: milestone mutations are blocked when the
 * project is archived, returning 409 with the unarchive hint.
 */
function requireActiveProject(project: { slug: string; status: string }): void {
  if (project.status !== 'active') {
    throw new AppError(
      `Project '${project.slug}' is archived — unarchive it before making changes`,
      409
    );
  }
}

// GET /api/tenants/:t/workspaces/:w/projects/:projectSlug/milestones
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const project = await resolveProject(req);
    const items = await listMilestonesByProject(project.id);
    res.json({ success: true, data: items });
  })
);

// POST /api/tenants/:t/workspaces/:w/projects/:projectSlug/milestones
router.post(
  '/',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const project = await resolveProject(req);
    requireActiveProject(project);
    const input = CreateMilestoneSchema.parse(req.body);
    const milestone = await createMilestone({
      workspaceId: req.scope.workspaceId,
      projectId: project.id,
      name: input.name,
      description: input.description,
      date: input.date,
    });
    res.status(201).json({ success: true, data: milestone });
  })
);

// GET /api/tenants/:t/workspaces/:w/projects/:projectSlug/milestones/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const id = IdParamSchema.parse(req.params.id);
    const project = await resolveProject(req);
    const milestone = await getMilestone(req.scope.workspaceId, id);
    // Confirm the milestone actually belongs to the URL's project — a
    // milestone uuid that lives in the same workspace but on a different
    // project should 404, not silently render under the wrong tab.
    if (!milestone || milestone.projectId !== project.id) {
      throw new AppError(`Milestone '${id}' not found`, 404);
    }
    res.json({ success: true, data: milestone });
  })
);

// PATCH /api/tenants/:t/workspaces/:w/projects/:projectSlug/milestones/:id
router.patch(
  '/:id',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const id = IdParamSchema.parse(req.params.id);
    const project = await resolveProject(req);
    requireActiveProject(project);
    // Confirm the milestone belongs to this project before we apply the
    // patch — otherwise a workspace-level uuid could be mutated through
    // any project's URL.
    const existing = await getMilestone(req.scope.workspaceId, id);
    if (!existing || existing.projectId !== project.id) {
      throw new AppError(`Milestone '${id}' not found`, 404);
    }
    const patch = UpdateMilestoneSchema.parse(req.body);
    const milestone = await updateMilestone(req.scope.workspaceId, id, patch);
    res.json({ success: true, data: milestone });
  })
);

// DELETE /api/tenants/:t/workspaces/:w/projects/:projectSlug/milestones/:id
router.delete(
  '/:id',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const id = IdParamSchema.parse(req.params.id);
    const project = await resolveProject(req);
    requireActiveProject(project);
    const existing = await getMilestone(req.scope.workspaceId, id);
    if (!existing || existing.projectId !== project.id) {
      throw new AppError(`Milestone '${id}' not found`, 404);
    }
    await deleteMilestone(req.scope.workspaceId, id);
    res.status(204).end();
  })
);

export default router;
