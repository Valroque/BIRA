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
import { setIssueParent } from '../usecases/issues/setIssueParent.js';
import { relateIssues } from '../usecases/issueLinks/relateIssues.js';
import { unrelateIssues } from '../usecases/issueLinks/unrelateIssues.js';
import { addDependency } from '../usecases/issueLinks/addDependency.js';
import { removeDependency } from '../usecases/issueLinks/removeDependency.js';
import * as issueService from '../services/issueService.js';
import { ISSUE_TYPES, STATUSES, PRIORITIES } from '../lib/constants.js';

const ISSUE_KEY_RE = /^[A-Z0-9]+-\d+$/;

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
  // External callers reference issues by key (e.g. 'CMT-7'); the route
  // resolves this to a uuid before handing off to the usecase.
  parent: z.string().regex(ISSUE_KEY_RE).nullable().optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  estimate: z.number().int().nonnegative().nullable().optional(),
});

const SetParentSchema = z.object({
  parent: z.string().regex(ISSUE_KEY_RE).nullable(),
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const UpdateIssueSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(50_000).nullable().optional(),
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
    labels: z.array(z.string().min(1).max(64)).max(64).optional(),
    startDate: z.string().regex(ISO_DATE).nullable().optional(),
    endDate: z.string().regex(ISO_DATE).nullable().optional(),
    estimate: z.number().int().nonnegative().nullable().optional(),
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
    // Resolve `parent` (issue key) → uuid. We do this in the route so
    // the usecase signature stays uuid-typed and the FE-friendly key
    // form lives in one place.
    let parentIssueId: string | null | undefined = undefined;
    if (input.parent !== undefined) {
      if (input.parent === null) {
        parentIssueId = null;
      } else {
        const parent = await issueService.findByKey(req.scope.workspaceId, input.parent);
        if (!parent) {
          throw new AppError(`Parent issue '${input.parent}' not found`, 400);
        }
        parentIssueId = parent.id;
      }
    }
    const { parent: _ignored, ...rest } = input;
    void _ignored;
    const issue = await createIssue({
      ...rest,
      workspaceId: req.scope.workspaceId,
      projectId: project.id,
      reporterUserId: req.user.id,
      parentIssueId,
    });
    // createIssue returns the entity; wrap it in the IssueView shape
    // so create + get + list responses are uniform.
    const view = await getIssue(req.scope.workspaceId, issue.key);
    res.status(201).json({ success: true, data: view ?? issue });
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
    if (!req.scope?.workspaceId || !req.user) throw new AppError('Workspace scope missing', 500);
    await resolveProject(req);
    const patch = UpdateIssueSchema.parse(req.body);
    const issue = await updateIssue(req.scope.workspaceId, req.params.key, patch, {
      actingUserId: req.user.id,
      actingUserRole: req.scope.role,
    });
    // Wrap as IssueView so the response shape matches GET / list.
    const view = await getIssue(req.scope.workspaceId, issue.key);
    res.json({ success: true, data: view ?? issue });
  })
);

// PATCH /api/tenants/:t/workspaces/:w/projects/:projectSlug/issues/:key/parent
//
// Hierarchy mutations live here, NOT on the general PATCH /:key, so the
// type-pair / scope / cycle validation is concentrated in setIssueParent.
router.patch(
  '/:key/parent',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    await resolveProject(req);
    const body = SetParentSchema.parse(req.body);

    const child = await issueService.findByKey(req.scope.workspaceId, req.params.key);
    if (!child) throw new AppError(`Issue '${req.params.key}' not found`, 404);

    let parentIssueId: string | null = null;
    if (body.parent !== null) {
      const parent = await issueService.findByKey(req.scope.workspaceId, body.parent);
      if (!parent) {
        throw new AppError(`Parent issue '${body.parent}' not found`, 400);
      }
      parentIssueId = parent.id;
    }

    await setIssueParent({
      workspaceId: req.scope.workspaceId,
      issueId: child.id,
      parentIssueId,
    });

    const view = await getIssue(req.scope.workspaceId, child.key);
    res.json({ success: true, data: view });
  })
);

// ---- issue links (slice 8) ----

const RelatesBodySchema = z.object({ relatedKey: z.string().regex(ISSUE_KEY_RE) });
const DependencyBodySchema = z.object({ blockerKey: z.string().regex(ISSUE_KEY_RE) });

// POST /:key/relates  body { relatedKey }
router.post(
  '/:key/relates',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    await resolveProject(req);
    const body = RelatesBodySchema.parse(req.body);
    await relateIssues({
      workspaceId: req.scope.workspaceId,
      aKey: req.params.key,
      bKey: body.relatedKey,
    });
    const view = await getIssue(req.scope.workspaceId, req.params.key);
    res.status(200).json({ success: true, data: view });
  })
);

// DELETE /:key/relates/:relatedKey
router.delete(
  '/:key/relates/:relatedKey',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    if (!ISSUE_KEY_RE.test(req.params.relatedKey)) {
      throw new AppError('Invalid issue key', 400);
    }
    await resolveProject(req);
    await unrelateIssues({
      workspaceId: req.scope.workspaceId,
      aKey: req.params.key,
      bKey: req.params.relatedKey,
    });
    const view = await getIssue(req.scope.workspaceId, req.params.key);
    res.status(200).json({ success: true, data: view });
  })
);

// POST /:key/dependencies  body { blockerKey }  (this issue depends on blockerKey)
router.post(
  '/:key/dependencies',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    await resolveProject(req);
    const body = DependencyBodySchema.parse(req.body);
    await addDependency({
      workspaceId: req.scope.workspaceId,
      blockerKey: body.blockerKey,
      dependentKey: req.params.key,
    });
    const view = await getIssue(req.scope.workspaceId, req.params.key);
    res.status(200).json({ success: true, data: view });
  })
);

// DELETE /:key/dependencies/:blockerKey
router.delete(
  '/:key/dependencies/:blockerKey',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    if (!ISSUE_KEY_RE.test(req.params.blockerKey)) {
      throw new AppError('Invalid issue key', 400);
    }
    await resolveProject(req);
    await removeDependency({
      workspaceId: req.scope.workspaceId,
      blockerKey: req.params.blockerKey,
      dependentKey: req.params.key,
    });
    const view = await getIssue(req.scope.workspaceId, req.params.key);
    res.status(200).json({ success: true, data: view });
  })
);

export default router;
