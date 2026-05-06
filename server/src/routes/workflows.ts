import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  authorize,
  requireActiveTenant,
  requireActiveWorkspace,
} from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { STATUSES } from '../lib/constants.js';
import { RULE_TYPES } from '../entities/WorkflowTransitionRule.js';
import { createWorkflow } from '../usecases/workflows/createWorkflow.js';
import { getWorkflow } from '../usecases/workflows/getWorkflow.js';
import { listWorkflows } from '../usecases/workflows/listWorkflows.js';
import { updateWorkflow } from '../usecases/workflows/updateWorkflow.js';
import { deleteWorkflow } from '../usecases/workflows/deleteWorkflow.js';

// mergeParams so :tenantSlug / :workspaceSlug from the parent router land here.
const router: Router = Router({ mergeParams: true });

const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Slug must be lowercase a-z, 0-9, dashes');

const NodeSchema = z.object({
  // Client-supplied uuid for nodes that already exist on the BE (the
  // editor saves nodes + transitions atomically and needs to keep the
  // ids stable across the full-replace). Omit on freshly-added nodes —
  // BE mints one. See server/README.md "Workflows" section.
  id: z.string().uuid().optional(),
  statusId: z.enum(STATUSES),
  x: z.number().int(),
  y: z.number().int(),
  isInitial: z.boolean().optional(),
  isTerminal: z.boolean().optional(),
});

const RuleSchema = z.object({
  type: z.enum(RULE_TYPES),
  // params shape is validated by validateRuleParams in the usecase —
  // schema here just permits anything jsonb-shaped.
  params: z.unknown().nullable().optional(),
});

const TransitionSchema = z.object({
  fromNodeId: z.string().uuid(),
  toNodeId: z.string().uuid(),
  label: z.string().max(64).nullable().optional(),
  dashed: z.boolean().optional(),
  rules: z.array(RuleSchema).max(32).optional(),
});

const CreateWorkflowSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  nodes: z.array(NodeSchema).min(1).max(32),
  transitions: z.array(TransitionSchema).max(128).optional(),
});

const UpdateWorkflowSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).nullable().optional(),
    nodes: z.array(NodeSchema).min(1).max(32).optional(),
    transitions: z.array(TransitionSchema).max(128).optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

// GET /api/tenants/:t/workspaces/:w/workflows
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const items = await listWorkflows(req.scope.workspaceId);
    res.json({ success: true, data: items });
  })
);

// POST /api/tenants/:t/workspaces/:w/workflows
router.post(
  '/',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const input = CreateWorkflowSchema.parse(req.body);
    const view = await createWorkflow({
      ...input,
      workspaceId: req.scope.workspaceId,
    });
    res.status(201).json({ success: true, data: view });
  })
);

// GET /api/tenants/:t/workspaces/:w/workflows/:slug
router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const view = await getWorkflow(req.scope.workspaceId, req.params.slug);
    if (!view) throw new AppError(`Workflow '${req.params.slug}' not found`, 404);
    res.json({ success: true, data: view });
  })
);

// PATCH /api/tenants/:t/workspaces/:w/workflows/:slug
router.patch(
  '/:slug',
  authorize('write'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const patch = UpdateWorkflowSchema.parse(req.body);
    const view = await updateWorkflow(req.scope.workspaceId, req.params.slug, patch);
    res.json({ success: true, data: view });
  })
);

// DELETE /api/tenants/:t/workspaces/:w/workflows/:slug — admin only
router.delete(
  '/:slug',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    await deleteWorkflow(req.scope.workspaceId, req.params.slug);
    res.status(204).end();
  })
);

export default router;
