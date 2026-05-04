import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { resolveTenantScope, resolveWorkspaceScope } from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { listTenants } from '../usecases/tenants/listTenants.js';
import workspacesRouter from './workspaces.js';
import projectsRouter from './projects.js';

const router: Router = Router();

router.use(authenticate);

// GET /api/tenants — tenants visible to the current user
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    const items = await listTenants(req.user.id);
    res.json({ success: true, data: items });
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

// /api/tenants/:tenantSlug/workspaces — workspace listing + create
router.use('/:tenantSlug/workspaces', workspacesRouter);

// /api/tenants/:tenantSlug/workspaces/:workspaceSlug/projects — project routes
// (workspaceSlug is resolved inside the projects router via resolveWorkspaceScope.)
router.use(
  '/:tenantSlug/workspaces/:workspaceSlug/projects',
  resolveWorkspaceScope,
  projectsRouter
);

export default router;
