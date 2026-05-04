import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requirePasswordResetCleared } from '../middleware/auth.js';
import { authorize, resolveTenantScope, resolveWorkspaceScope } from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { listTenants } from '../usecases/tenants/listTenants.js';
import { createTenant } from '../usecases/tenants/createTenant.js';
import { setTenantStatus } from '../usecases/tenants/setTenantStatus.js';
import workspacesRouter from './workspaces.js';
import projectsRouter from './projects.js';
import tenantMembersRouter from './tenantMembers.js';
import issuesRouter from './issues.js';

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

const router: Router = Router();

router.use(authenticate);
// Hard gate: a user with `mustResetPassword` set cannot touch ANY tenant
// surface — including the top-level tenant list. The only escape hatch is
// POST /api/auth/change-password, which is mounted on a different router
// that intentionally does not gate locked users.
router.use(requirePasswordResetCleared);

// GET /api/tenants?includeDeactivated=true — tenants visible to the current
// user. Deactivated tenants are hidden by default; opt in to surface them
// (e.g. so the owning admin can find them and reactivate).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    const includeDeactivated = req.query.includeDeactivated === 'true';
    const items = await listTenants(req.user.id, { includeDeactivated });
    res.json({ success: true, data: items });
  })
);

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

// POST /api/tenants/:tenantSlug/deactivate — tenant admin only. Soft-freeze;
// no data is destroyed. The tenant disappears from the default `GET
// /api/tenants` list (an admin can still find it via
// `?includeDeactivated=true` to reactivate).
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

// /api/tenants/:tenantSlug/members — tenant member admin actions (e.g. admin
// password reset). Tenant scope is already resolved above, so the members
// router can read req.scope directly.
router.use('/:tenantSlug/members', tenantMembersRouter);

export default router;
