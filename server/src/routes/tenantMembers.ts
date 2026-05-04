import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authorize, requireActiveTenant } from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../middleware/logger.js';
import { adminResetPassword } from '../usecases/users/adminResetPassword.js';

// mergeParams: parent router (tenants.ts) holds :tenantSlug — and the
// tenant scope is already resolved by the time we mount this router.
const router: Router = Router({ mergeParams: true });

const UserIdSchema = z.string().uuid();

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

export default router;
