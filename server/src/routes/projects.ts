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
import { updateProject } from '../usecases/projects/updateProject.js';
import { setProjectStatus } from '../usecases/projects/setProjectStatus.js';
import { getProjectWorkflows } from '../usecases/projects/getProjectWorkflows.js';
import { setProjectWorkflow } from '../usecases/projects/setProjectWorkflow.js';
import * as projectService from '../services/projectService.js';
import { ISSUE_TYPES, PROJECT_STATUSES } from '../lib/constants.js';
import type { Project } from '../entities/Project.js';
import projectIssuesRouter from './projectIssues.js';
import projectAccessRouter from './projectAccess.js';

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

// Slug + key are intentionally NOT updatable — both are load-bearing in
// URLs, issue keys (CMT-7), and FE-side localStorage. Mirrors the
// workspace PATCH constraint.
const UpdateProjectSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    letter: z.string().min(1).max(4).optional(),
    color: z.string().min(1).max(16).optional(),
    bg: z.string().min(1).max(16).optional(),
    description: z.string().max(2000).optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

const SetProjectWorkflowSchema = z.object({
  workflowSlug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Slug must be lowercase a-z, 0-9, dashes'),
});

/**
 * Decorate a project with its workflow assignment map. Used in the
 * list / get / create responses so the FE adapter has a uniform shape
 * to read from.
 */
async function decorateProject(workspaceId: string, project: Project) {
  const workflows = await getProjectWorkflows(workspaceId, project.id);
  return { ...project, workflows };
}

// GET /api/tenants/:tenantSlug/workspaces/:workspaceSlug/projects?includeArchived=true
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const includeArchived = req.query.includeArchived === 'true';
    const items = await listProjects(req.scope.workspaceId, { includeArchived });
    const decorated = await Promise.all(
      items.map((p) => decorateProject(req.scope!.workspaceId!, p))
    );
    res.json({ success: true, data: decorated });
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
    const decorated = await decorateProject(req.scope.workspaceId, project);
    res.status(201).json({ success: true, data: decorated });
  })
);

// GET /api/tenants/:tenantSlug/workspaces/:workspaceSlug/projects/:projectSlug?includeArchived=true
//
// Default behaviour mirrors the workspace detail endpoint: archived
// projects 404 unless `?includeArchived=true` is set. Mutation paths
// below (PATCH, archive/unarchive) always allow the lookup so admins
// can manage archived projects, but the read returns 404 to fail-fast
// stale FE bookmarks.
router.get(
  '/:projectSlug',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const includeArchived = req.query.includeArchived === 'true';
    const project = await projectService.findBySlug(
      req.scope.workspaceId,
      req.params.projectSlug
    );
    if (!project) throw new AppError(`Project '${req.params.projectSlug}' not found`, 404);
    if (project.status === 'archived' && !includeArchived) {
      throw new AppError(
        `Project '${req.params.projectSlug}' is archived — pass ?includeArchived=true to view it`,
        404
      );
    }
    const decorated = await decorateProject(req.scope.workspaceId, project);
    res.json({ success: true, data: decorated });
  })
);

// PATCH /api/tenants/:t/workspaces/:w/projects/:projectSlug — workspace
// admin (effective role; tenant admins are covered via the tenant-admin-
// wins rule in resolveWorkspaceScope). Slug + key + status are not
// patchable — status flips through archive/unarchive below.
router.patch(
  '/:projectSlug',
  authorize('admin'),
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const project = await projectService.findBySlug(
      req.scope.workspaceId,
      req.params.projectSlug
    );
    if (!project) throw new AppError(`Project '${req.params.projectSlug}' not found`, 404);
    const patch = UpdateProjectSchema.parse(req.body);
    const updated = await updateProject({ projectId: project.id, patch });
    const decorated = await decorateProject(req.scope.workspaceId, updated);
    res.json({ success: true, data: decorated });
  })
);

// POST /api/tenants/:t/workspaces/:w/projects/:projectSlug/archive —
// workspace admin. Archive freezes the project: issue create / update
// is blocked (see projectIssues router); reads continue to work via
// `?includeArchived=true`. Mirrors workspace archive but at the project
// scope, so a workspace admin can manage their own portfolio without
// needing tenant-admin to flip a single project.
router.post(
  '/:projectSlug/archive',
  authorize('admin'),
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const project = await projectService.findBySlug(
      req.scope.workspaceId,
      req.params.projectSlug
    );
    if (!project) throw new AppError(`Project '${req.params.projectSlug}' not found`, 404);
    const updated = await setProjectStatus(project.id, 'archived');
    const decorated = await decorateProject(req.scope.workspaceId, updated);
    res.json({ success: true, data: decorated });
  })
);

// POST /api/tenants/:t/workspaces/:w/projects/:projectSlug/unarchive
router.post(
  '/:projectSlug/unarchive',
  authorize('admin'),
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const project = await projectService.findBySlug(
      req.scope.workspaceId,
      req.params.projectSlug
    );
    if (!project) throw new AppError(`Project '${req.params.projectSlug}' not found`, 404);
    const updated = await setProjectStatus(project.id, 'active');
    const decorated = await decorateProject(req.scope.workspaceId, updated);
    res.json({ success: true, data: decorated });
  })
);

// GET /api/tenants/:t/workspaces/:w/projects/:projectSlug/workflows
router.get(
  '/:projectSlug/workflows',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const project = await projectService.findBySlug(
      req.scope.workspaceId,
      req.params.projectSlug
    );
    if (!project) throw new AppError(`Project '${req.params.projectSlug}' not found`, 404);
    const workflows = await getProjectWorkflows(req.scope.workspaceId, project.id);
    res.json({ success: true, data: workflows });
  })
);

// PUT /api/tenants/:t/workspaces/:w/projects/:projectSlug/workflows/:issueType
router.put(
  '/:projectSlug/workflows/:issueType',
  authorize('write'),
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const project = await projectService.findBySlug(
      req.scope.workspaceId,
      req.params.projectSlug
    );
    if (!project) throw new AppError(`Project '${req.params.projectSlug}' not found`, 404);

    const issueType = req.params.issueType;
    if (!ISSUE_TYPES.includes(issueType as (typeof ISSUE_TYPES)[number])) {
      throw new AppError(`Invalid issue type '${issueType}'`, 400);
    }

    const body = SetProjectWorkflowSchema.parse(req.body);
    await setProjectWorkflow({
      workspaceId: req.scope.workspaceId,
      projectId: project.id,
      issueType: issueType as (typeof ISSUE_TYPES)[number],
      workflowSlug: body.workflowSlug,
    });

    const workflows = await getProjectWorkflows(req.scope.workspaceId, project.id);
    res.json({ success: true, data: workflows });
  })
);

// /api/tenants/:t/workspaces/:w/projects/:projectSlug/issues — issue routes
// (workspace scope is already resolved by the parent router; project lookup
// happens inside the issues router).
router.use('/:projectSlug/issues', projectIssuesRouter);

// /api/tenants/:t/workspaces/:w/projects/:projectSlug/access — project
// access grants + effective members. Project lookup happens inside the
// access router so the same `:projectSlug` token serves both reads and
// mutations.
router.use('/:projectSlug/access', projectAccessRouter);

export default router;
