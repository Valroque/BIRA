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
import { listTeams } from '../usecases/teams/listTeams.js';
import { getTeam } from '../usecases/teams/getTeam.js';
import { createTeam } from '../usecases/teams/createTeam.js';
import { updateTeam } from '../usecases/teams/updateTeam.js';
import { deleteTeam } from '../usecases/teams/deleteTeam.js';
import { addTeamMember } from '../usecases/teams/addTeamMember.js';
import { removeTeamMember } from '../usecases/teams/removeTeamMember.js';

// mergeParams: parent (tenants.ts → /:tenantSlug/workspaces/:workspaceSlug)
// holds the slugs; workspace scope is already resolved.
const router: Router = Router({ mergeParams: true });

const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Slug must be lowercase a-z, 0-9, dashes');

const CreateTeamSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  color: z.string().min(1).max(16),
});

// Slug is intentionally not patchable — it's URL-load-bearing.
const UpdateTeamSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).optional(),
    color: z.string().min(1).max(16).optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

const AddTeamMemberSchema = z.object({
  userId: z.string().uuid(),
});

// GET /api/tenants/:t/workspaces/:w/teams — any workspace member.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const items = await listTeams({ workspaceId: req.scope.workspaceId });
    res.json({ success: true, data: items });
  })
);

// POST /api/tenants/:t/workspaces/:w/teams — workspace admin only.
router.post(
  '/',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    const body = CreateTeamSchema.parse(req.body);
    const team = await createTeam({
      ...body,
      workspaceId: req.scope.workspaceId,
      createdByUserId: req.user.id,
    });
    logger.info('Created team', {
      actingUserId: req.user.id,
      teamId: team.id,
      workspaceId: req.scope.workspaceId,
    });
    res.status(201).json({ success: true, data: team });
  })
);

// GET /api/tenants/:t/workspaces/:w/teams/:teamSlug
router.get(
  '/:teamSlug',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const team = await getTeam({
      workspaceId: req.scope.workspaceId,
      teamSlug: req.params.teamSlug,
    });
    res.json({ success: true, data: team });
  })
);

// PATCH /api/tenants/:t/workspaces/:w/teams/:teamSlug — workspace admin.
router.patch(
  '/:teamSlug',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    const patch = UpdateTeamSchema.parse(req.body);
    const team = await updateTeam({
      workspaceId: req.scope.workspaceId,
      teamSlug: req.params.teamSlug,
      patch,
    });
    logger.info('Updated team', {
      actingUserId: req.user.id,
      teamId: team.id,
      workspaceId: req.scope.workspaceId,
    });
    res.json({ success: true, data: team });
  })
);

// DELETE /api/tenants/:t/workspaces/:w/teams/:teamSlug — workspace admin.
router.delete(
  '/:teamSlug',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    await deleteTeam({
      workspaceId: req.scope.workspaceId,
      teamSlug: req.params.teamSlug,
    });
    logger.info('Deleted team', {
      actingUserId: req.user.id,
      teamSlug: req.params.teamSlug,
      workspaceId: req.scope.workspaceId,
    });
    res.status(204).send();
  })
);

// GET /api/tenants/:t/workspaces/:w/teams/:teamSlug/members — same payload
// shape as the team-detail endpoint's `members` field; exposed separately
// so the FE roster panel doesn't have to walk through the team object.
router.get(
  '/:teamSlug/members',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const team = await getTeam({
      workspaceId: req.scope.workspaceId,
      teamSlug: req.params.teamSlug,
    });
    res.json({ success: true, data: team.members });
  })
);

// POST /api/tenants/:t/workspaces/:w/teams/:teamSlug/members — workspace
// admin. Service guard rejects users who aren't active workspace members.
router.post(
  '/:teamSlug/members',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    const body = AddTeamMemberSchema.parse(req.body);
    const team = await addTeamMember({
      workspaceId: req.scope.workspaceId,
      teamSlug: req.params.teamSlug,
      userId: body.userId,
    });
    logger.info('Added team member', {
      actingUserId: req.user.id,
      teamId: team.id,
      targetUserId: body.userId,
      workspaceId: req.scope.workspaceId,
    });
    res.status(201).json({ success: true, data: team });
  })
);

// DELETE /api/tenants/:t/workspaces/:w/teams/:teamSlug/members/:userId
router.delete(
  '/:teamSlug/members/:userId',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    const userId = z.string().uuid().parse(req.params.userId);
    const team = await removeTeamMember({
      workspaceId: req.scope.workspaceId,
      teamSlug: req.params.teamSlug,
      userId,
    });
    logger.info('Removed team member', {
      actingUserId: req.user.id,
      teamId: team.id,
      targetUserId: userId,
      workspaceId: req.scope.workspaceId,
    });
    res.json({ success: true, data: team });
  })
);

export default router;
