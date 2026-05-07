import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requirePasswordResetCleared } from '../middleware/auth.js';
import { authorize, requireActiveTenant, resolveTenantScope, resolveWorkspaceScope } from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { listTenants } from '../usecases/tenants/listTenants.js';
import { createTenant } from '../usecases/tenants/createTenant.js';
import { updateTenant } from '../usecases/tenants/updateTenant.js';
import { setTenantStatus } from '../usecases/tenants/setTenantStatus.js';
import workspacesRouter from './workspaces.js';
import projectsRouter from './projects.js';
import tenantMembersRouter from './tenantMembers.js';
import workspaceMembersRouter from './workspaceMembers.js';
import teamsRouter from './teams.js';
import issuesRouter from './issues.js';
import milestonesRouter from './milestones.js';
import workflowsRouter from './workflows.js';
import filesRouter from './files.js';
import mentionablesRouter from './mentionables.js';
import commentsRouter from './comments.js';

const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Slug must be lowercase a-z, 0-9, dashes');

const CreateTenantSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
  letter: z.string().min(1).max(4),
  color: z.string().min(1).max(16),
  bg: z.string().min(1).max(16),
  plan: z.string().min(1).max(32).optional(),
});

// Slug + plan are intentionally NOT updatable here — slug is load-bearing in
// URLs and tenant-keyed localStorage; plan changes belong to a billing flow.
const UpdateTenantSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    letter: z.string().min(1).max(4).optional(),
    color: z.string().min(1).max(16).optional(),
    bg: z.string().min(1).max(16).optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

const router: Router = Router();

// GET /api/tenants — public. Returns all active tenants, ordered by name.
// Powers the pre-login tenant picker. Deactivated tenants are always
// excluded; there is no `includeDeactivated` knob here because there is no
// caller context to authorise it against.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const items = await listTenants();
    res.json({ success: true, data: items });
  })
);

// All routes below this line require authentication.
router.use(authenticate);
// Hard gate: a user with `mustResetPassword` set cannot touch any auth-gated
// tenant surface. The only escape hatch is POST /api/auth/change-password,
// which is mounted on a different router that intentionally does not gate
// locked users.
router.use(requirePasswordResetCleared);

// POST /api/tenants — any authenticated user may spin up their own tenant.
// The caller is granted `admin` membership on the new tenant in the same
// transaction; from then on they own deactivate / reactivate / workspace
// admin actions for it.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    const input = CreateTenantSchema.parse(req.body);
    const tenant = await createTenant({ ...input, creatorUserId: req.user.id });
    res.status(201).json({ success: true, data: tenant });
  })
);

// All :tenantSlug routes go through tenant-scope resolution.
router.use('/:tenantSlug', resolveTenantScope);

// GET /api/tenants/:tenantSlug — tenant detail
router.get(
  '/:tenantSlug',
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new AppError('Scope missing', 500);
    res.json({
      success: true,
      data: {
        id: req.scope.tenantId,
        slug: req.scope.tenantSlug,
        role: req.scope.role,
      },
    });
  })
);

// PATCH /api/tenants/:tenantSlug — tenant admin only. Updates display fields
// (name, letter, color, bg). Slug is immutable. Frozen tenants reject writes
// via requireActiveTenant.
router.patch(
  '/:tenantSlug',
  authorize('admin'),
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new AppError('Scope missing', 500);
    const patch = UpdateTenantSchema.parse(req.body);
    const tenant = await updateTenant({ tenantId: req.scope.tenantId, patch });
    res.json({ success: true, data: tenant });
  })
);

// POST /api/tenants/:tenantSlug/deactivate — tenant admin only. Soft-freeze;
// no data is destroyed. The tenant disappears from the public `GET
// /api/tenants` picker. An admin who knows the slug can still reach the
// detail endpoint and POST `/reactivate` to flip it back.
router.post(
  '/:tenantSlug/deactivate',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new AppError('Scope missing', 500);
    const tenant = await setTenantStatus(req.scope.tenantId, 'deactivated');
    res.json({ success: true, data: tenant });
  })
);

// POST /api/tenants/:tenantSlug/reactivate — tenant admin only. Mirrors
// deactivate; idempotent.
router.post(
  '/:tenantSlug/reactivate',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new AppError('Scope missing', 500);
    const tenant = await setTenantStatus(req.scope.tenantId, 'active');
    res.json({ success: true, data: tenant });
  })
);

// /api/tenants/:tenantSlug/workspaces — workspace listing + create
router.use('/:tenantSlug/workspaces', workspacesRouter);

// /api/tenants/:tenantSlug/workspaces/:workspaceSlug/projects — project routes
// (workspaceSlug is resolved inside the projects router via resolveWorkspaceScope.)
router.use(
  '/:tenantSlug/workspaces/:workspaceSlug/projects',
  resolveWorkspaceScope,
  projectsRouter
);

// /api/tenants/:tenantSlug/workspaces/:workspaceSlug/issues — workspace-scoped
// issue listing (across all projects in the workspace).
router.use(
  '/:tenantSlug/workspaces/:workspaceSlug/issues',
  resolveWorkspaceScope,
  issuesRouter
);

// /api/tenants/:tenantSlug/workspaces/:workspaceSlug/milestones — workspace-
// scoped milestone listing (optionally filtered by ?projectId=). Project-
// scoped CRUD lives under /projects/:p/milestones.
router.use(
  '/:tenantSlug/workspaces/:workspaceSlug/milestones',
  resolveWorkspaceScope,
  milestonesRouter
);

// /api/tenants/:tenantSlug/workspaces/:workspaceSlug/workflows — workflows
// + their nodes/transitions/rules. (slice 3 + slice 5)
router.use(
  '/:tenantSlug/workspaces/:workspaceSlug/workflows',
  resolveWorkspaceScope,
  workflowsRouter
);

// /api/tenants/:tenantSlug/workspaces/:workspaceSlug/files — file upload,
// download, and delete. resolveWorkspaceScope is applied here (same pattern
// as the issues and workflows routers above).
router.use(
  '/:tenantSlug/workspaces/:workspaceSlug/files',
  resolveWorkspaceScope,
  filesRouter
);

// /api/tenants/:tenantSlug/workspaces/:workspaceSlug/mentionables — user/team
// search for @-mention pickers.
router.use(
  '/:tenantSlug/workspaces/:workspaceSlug/mentionables',
  resolveWorkspaceScope,
  mentionablesRouter
);

// /api/tenants/:tenantSlug/workspaces/:workspaceSlug/comments — PATCH and
// DELETE for individual comments. (GET/POST live in projectIssues.ts under
// /:key/comments.) Comment uuids are workspace-unique so we don't need the
// project slug here.
router.use(
  '/:tenantSlug/workspaces/:workspaceSlug/comments',
  resolveWorkspaceScope,
  commentsRouter
);

// /api/tenants/:tenantSlug/workspaces/:workspaceSlug/members — workspace
// member directory + add / update / remove. Workspace scope is resolved
// here so the members router can read role + ids directly.
router.use(
  '/:tenantSlug/workspaces/:workspaceSlug/members',
  resolveWorkspaceScope,
  workspaceMembersRouter
);

// /api/tenants/:tenantSlug/workspaces/:workspaceSlug/teams — team CRUD
// + team membership management. Mirrors the workspace-members mount.
router.use(
  '/:tenantSlug/workspaces/:workspaceSlug/teams',
  resolveWorkspaceScope,
  teamsRouter
);

// /api/tenants/:tenantSlug/members — tenant member admin actions (e.g. admin
// password reset). Tenant scope is already resolved above, so the members
// router can read req.scope directly.
router.use('/:tenantSlug/members', tenantMembersRouter);

export default router;
