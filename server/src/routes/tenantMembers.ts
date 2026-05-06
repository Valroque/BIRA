import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authorize, requireActiveTenant } from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../middleware/logger.js';
import { adminResetPassword } from '../usecases/users/adminResetPassword.js';
import { setUserActive } from '../usecases/users/setUserActive.js';
import { getTenantUserById } from '../usecases/users/getTenantUserById.js';

// mergeParams: parent router (tenants.ts) holds :tenantSlug — and the
// tenant scope is already resolved by the time we mount this router.
const router: Router = Router({ mergeParams: true });

const UserIdSchema = z.string().uuid();

// GET /api/tenants/:tenantSlug/members/:userId — single-user lookup, tenant
// scoped. Powers the FE's UUID-fallback path for resolving display names of
// users who aren't in the current workspace's directory (former workspace
// members, tenant admins not joined here, etc.). Open to any tenant member
// (read+) — names + emails are not sensitive within a tenant.
router.get(
  '/:userId',
  authorize('read'),
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new AppError('Scope missing', 500);
    const targetUserId = UserIdSchema.parse(req.params.userId);
    const user = await getTenantUserById({
      tenantId: req.scope.tenantId,
      userId: targetUserId,
    });
    res.json({ success: true, data: user });
  })
);

// POST /api/tenants/:tenantSlug/members/:userId/reset-password — tenant
// admin generates a fresh temp password for another member. Server returns
// the plaintext exactly once; admin shares it OOB. The target user is
// flagged with `mustResetPassword: true` until they self-rotate via
// POST /api/auth/change-password.
router.post(
  '/:userId/reset-password',
  authorize('admin'),
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope) throw new AppError('Scope missing', 500);
    const targetUserId = UserIdSchema.parse(req.params.userId);
    const result = await adminResetPassword({
      actingUserId: req.user.id,
      tenantId: req.scope.tenantId,
      targetUserId,
    });
    // IMPORTANT: log the action but NEVER the temporary password.
    logger.info('Admin reset password', {
      actingUserId: req.user.id,
      targetUserId: result.user.id,
      tenantId: req.scope.tenantId,
    });
    res.json({ success: true, data: result });
  })
);

// POST /api/tenants/:tenantSlug/members/:userId/deactivate — tenant admin
// flips the target user's `isActive` flag to false. Effective scope is
// global (the user can't log in to ANY tenant), but the gate is tenant-
// admin because BIRA has no system-level admin in v1. The target must
// be an active member of this tenant — admins can't deactivate strangers.
// Active sessions for the deactivated user are rejected on the next
// request by the auth middleware (which also checks `isActive`).
router.post(
  '/:userId/deactivate',
  authorize('admin'),
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope) throw new AppError('Scope missing', 500);
    const targetUserId = UserIdSchema.parse(req.params.userId);
    const user = await setUserActive({
      actingUserId: req.user.id,
      tenantId: req.scope.tenantId,
      targetUserId,
      isActive: false,
    });
    logger.info('Admin deactivated user', {
      actingUserId: req.user.id,
      targetUserId: user.id,
      tenantId: req.scope.tenantId,
    });
    res.json({ success: true, data: user });
  })
);

// POST /api/tenants/:tenantSlug/members/:userId/reactivate — tenant admin
// restores the user's ability to log in.
router.post(
  '/:userId/reactivate',
  authorize('admin'),
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope) throw new AppError('Scope missing', 500);
    const targetUserId = UserIdSchema.parse(req.params.userId);
    const user = await setUserActive({
      actingUserId: req.user.id,
      tenantId: req.scope.tenantId,
      targetUserId,
      isActive: true,
    });
    logger.info('Admin reactivated user', {
      actingUserId: req.user.id,
      targetUserId: user.id,
      tenantId: req.scope.tenantId,
    });
    res.json({ success: true, data: user });
  })
);

export default router;
