import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  authorize,
  requireActiveTenant,
  requireActiveWorkspace,
} from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../middleware/logger.js';
import { ROLES } from '../lib/constants.js';
import { listWorkspaceMembers } from '../usecases/workspaceMembers/listMembers.js';
import { addWorkspaceMember } from '../usecases/workspaceMembers/addMember.js';
import { updateWorkspaceMemberRole } from '../usecases/workspaceMembers/updateMemberRole.js';
import { removeWorkspaceMember } from '../usecases/workspaceMembers/removeMember.js';

// mergeParams: parent (tenants.ts → /:tenantSlug/workspaces/:workspaceSlug)
// holds the slugs; workspace scope is already resolved by the time we
// mount this router.
const router: Router = Router({ mergeParams: true });

const MembershipIdParam = z.string().uuid();

const AddMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES),
});

const UpdateRoleSchema = z.object({
  role: z.enum(ROLES),
});

// GET /api/tenants/:t/workspaces/:w/members — workspace member directory.
// Open to any workspace member (read+) so the FE can render the list
// without elevating; mutations below require admin.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const items = await listWorkspaceMembers({
      workspaceId: req.scope.workspaceId,
      tenantId: req.scope.tenantId,
    });
    res.json({ success: true, data: items });
  })
);

// POST /api/tenants/:t/workspaces/:w/members — workspace admin only.
// Direct-add: target must already be an active tenant member (the
// usecase rejects with 400 otherwise).
router.post(
  '/',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    const body = AddMemberSchema.parse(req.body);
    const member = await addWorkspaceMember({
      workspaceId: req.scope.workspaceId,
      tenantId: req.scope.tenantId,
      userId: body.userId,
      role: body.role,
    });
    // Log the action — never log the role value or any PII beyond ids.
    logger.info('Added workspace member', {
      actingUserId: req.user.id,
      targetUserId: body.userId,
      workspaceId: req.scope.workspaceId,
    });
    res.status(201).json({ success: true, data: member });
  })
);

// PATCH /api/tenants/:t/workspaces/:w/members/:membershipId — workspace
// admin only; last-admin guard refuses demoting the only effective admin.
router.patch(
  '/:membershipId',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    const membershipId = MembershipIdParam.parse(req.params.membershipId);
    const body = UpdateRoleSchema.parse(req.body);
    const member = await updateWorkspaceMemberRole({
      workspaceId: req.scope.workspaceId,
      tenantId: req.scope.tenantId,
      membershipId,
      role: body.role,
    });
    logger.info('Updated workspace member role', {
      actingUserId: req.user.id,
      membershipId,
      workspaceId: req.scope.workspaceId,
    });
    res.json({ success: true, data: member });
  })
);

// DELETE /api/tenants/:t/workspaces/:w/members/:membershipId — workspace
// admin removes anyone, OR the target self-leaves. The usecase enforces
// the (caller, target) split and the last-admin guard.
router.delete(
  '/:membershipId',
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    const membershipId = MembershipIdParam.parse(req.params.membershipId);
    await removeWorkspaceMember({
      workspaceId: req.scope.workspaceId,
      tenantId: req.scope.tenantId,
      membershipId,
      actingUserId: req.user.id,
      actingRole: req.scope.role,
    });
    logger.info('Removed workspace member', {
      actingUserId: req.user.id,
      membershipId,
      workspaceId: req.scope.workspaceId,
    });
    res.status(204).send();
  })
);

export default router;
