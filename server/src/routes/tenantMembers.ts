import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authorize, requireActiveTenant } from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../middleware/logger.js';
import { ROLES } from '../lib/constants.js';
import { adminResetPassword } from '../usecases/users/adminResetPassword.js';
import { setUserActive } from '../usecases/users/setUserActive.js';
import { getTenantUserById } from '../usecases/users/getTenantUserById.js';
import { listTenantMembers } from '../usecases/tenantMembers/listMembers.js';
import { addTenantMember } from '../usecases/tenantMembers/addMember.js';
import { updateTenantMemberRole } from '../usecases/tenantMembers/updateMemberRole.js';
import { removeTenantMember } from '../usecases/tenantMembers/removeMember.js';

// mergeParams: parent router (tenants.ts) holds :tenantSlug — and the
// tenant scope is already resolved by the time we mount this router.
const router: Router = Router({ mergeParams: true });

const UserIdSchema = z.string().uuid();

const AddMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES),
});

const UpdateRoleSchema = z.object({
  role: z.enum(ROLES),
});

// GET /api/tenants/:tenantSlug/members — tenant directory.
// Open to any tenant member (read+) so the FE can render the list without
// elevation; reaching this handler already requires `resolveTenantScope`,
// which gates non-members. Mutations live on per-user sub-routes below.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.scope) throw new AppError('Tenant scope missing', 500);
    const items = await listTenantMembers({ tenantId: req.scope.tenantId });
    res.json({ success: true, data: items });
  })
);

// POST /api/tenants/:tenantSlug/members — tenant admin only.
// Direct-add: target must already be a registered user (no invite-token
// flow in v1 — see issue #35). Idempotent on already-active member;
// re-activates `invited` / `deactivated` rows with the new role.
router.post(
  '/',
  authorize('admin'),
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope) throw new AppError('Scope missing', 500);
    const body = AddMemberSchema.parse(req.body);
    const member = await addTenantMember({
      tenantId: req.scope.tenantId,
      userId: body.userId,
      role: body.role,
    });
    logger.info('Added tenant member', {
      actingUserId: req.user.id,
      targetUserId: body.userId,
      tenantId: req.scope.tenantId,
    });
    res.status(201).json({ success: true, data: member });
  })
);

// PATCH /api/tenants/:tenantSlug/members/:userId — tenant admin only.
// Last-admin guard refuses demoting the only active admin.
router.patch(
  '/:userId',
  authorize('admin'),
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope) throw new AppError('Scope missing', 500);
    const targetUserId = UserIdSchema.parse(req.params.userId);
    const body = UpdateRoleSchema.parse(req.body);
    const member = await updateTenantMemberRole({
      tenantId: req.scope.tenantId,
      userId: targetUserId,
      role: body.role,
    });
    logger.info('Updated tenant member role', {
      actingUserId: req.user.id,
      targetUserId,
      tenantId: req.scope.tenantId,
    });
    res.json({ success: true, data: member });
  })
);

// DELETE /api/tenants/:tenantSlug/members/:userId — tenant admin removes
// anyone, OR the target self-leaves. The usecase enforces the
// (caller, target) split and the last-admin guard, plus cascades to
// workspace / team / project-access grants in the same transaction.
router.delete(
  '/:userId',
  requireActiveTenant,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope) throw new AppError('Scope missing', 500);
    const targetUserId = UserIdSchema.parse(req.params.userId);
    await removeTenantMember({
      tenantId: req.scope.tenantId,
      userId: targetUserId,
      actingUserId: req.user.id,
      actingRole: req.scope.role,
    });
    logger.info('Removed tenant member', {
      actingUserId: req.user.id,
      targetUserId,
      tenantId: req.scope.tenantId,
    });
    res.status(204).send();
  })
);

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
