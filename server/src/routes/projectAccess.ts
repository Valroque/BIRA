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
import * as projectService from '../services/projectService.js';
import { listProjectAccess } from '../usecases/projectAccess/listAccess.js';
import { addTeamGrant } from '../usecases/projectAccess/addTeamGrant.js';
import { updateTeamGrant } from '../usecases/projectAccess/updateTeamGrant.js';
import { removeTeamGrant } from '../usecases/projectAccess/removeTeamGrant.js';
import { addUserGrant } from '../usecases/projectAccess/addUserGrant.js';
import { updateUserGrant } from '../usecases/projectAccess/updateUserGrant.js';
import { removeUserGrant } from '../usecases/projectAccess/removeUserGrant.js';
import { listEffectiveMembers } from '../usecases/projectAccess/listEffectiveMembers.js';

// mergeParams: parent (projects.ts → /:projectSlug/access) holds tenantSlug,
// workspaceSlug, projectSlug. Workspace scope is resolved at the tenants.ts
// mount in front of the projects router; we resolve project here.
const router: Router = Router({ mergeParams: true });

// `admin` is intentionally excluded — admin is never inherited via a team
// (per `.claude/rules/v1-constraints.md` + DB CHECK constraint). Surface
// the bad input as a 400 at the route, not at the DB layer.
const TEAM_ROLE = z.enum(['write', 'read'] as const);
const USER_ROLE = z.enum(ROLES);

const AddTeamSchema = z.object({
  teamId: z.string().uuid(),
  role: TEAM_ROLE,
});

const UpdateTeamSchema = z.object({ role: TEAM_ROLE });

const AddUserSchema = z.object({
  userId: z.string().uuid(),
  role: USER_ROLE,
});

const UpdateUserSchema = z.object({ role: USER_ROLE });

async function resolveProject(req: { scope?: { workspaceId?: string }; params: { projectSlug?: string } }) {
  if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
  const slug = req.params.projectSlug;
  if (!slug) throw new AppError('Project slug missing in URL', 400);
  const project = await projectService.findBySlug(req.scope.workspaceId, slug);
  if (!project) throw new AppError(`Project '${slug}' not found`, 404);
  return project;
}

// GET /api/tenants/:t/workspaces/:w/projects/:p/access — workspace member.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const project = await resolveProject(req);
    const view = await listProjectAccess({ projectId: project.id });
    res.json({ success: true, data: view });
  })
);

// GET .../access/effective-members — flat list with provenance.
router.get(
  '/effective-members',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const project = await resolveProject(req);
    const members = await listEffectiveMembers({
      projectId: project.id,
      workspaceId: req.scope.workspaceId,
      tenantId: req.scope.tenantId,
    });
    res.json({ success: true, data: members });
  })
);

// POST .../access/teams — workspace admin.
router.post(
  '/teams',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    const body = AddTeamSchema.parse(req.body);
    const project = await resolveProject(req);
    const view = await addTeamGrant({
      projectId: project.id,
      workspaceId: req.scope.workspaceId,
      teamId: body.teamId,
      role: body.role,
    });
    logger.info('Added project team grant', {
      actingUserId: req.user.id,
      projectId: project.id,
      teamId: body.teamId,
    });
    res.status(201).json({ success: true, data: view });
  })
);

// PATCH .../access/teams/:teamId
router.patch(
  '/teams/:teamId',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError('Auth missing', 500);
    const teamId = z.string().uuid().parse(req.params.teamId);
    const body = UpdateTeamSchema.parse(req.body);
    const project = await resolveProject(req);
    const view = await updateTeamGrant({
      projectId: project.id,
      teamId,
      role: body.role,
    });
    logger.info('Updated project team grant', {
      actingUserId: req.user.id,
      projectId: project.id,
      teamId,
    });
    res.json({ success: true, data: view });
  })
);

// DELETE .../access/teams/:teamId
router.delete(
  '/teams/:teamId',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError('Auth missing', 500);
    const teamId = z.string().uuid().parse(req.params.teamId);
    const project = await resolveProject(req);
    const view = await removeTeamGrant({ projectId: project.id, teamId });
    logger.info('Removed project team grant', {
      actingUserId: req.user.id,
      projectId: project.id,
      teamId,
    });
    res.json({ success: true, data: view });
  })
);

// POST .../access/users
router.post(
  '/users',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    const body = AddUserSchema.parse(req.body);
    const project = await resolveProject(req);
    const view = await addUserGrant({
      projectId: project.id,
      workspaceId: req.scope.workspaceId,
      tenantId: req.scope.tenantId,
      userId: body.userId,
      role: body.role,
    });
    logger.info('Added project user grant', {
      actingUserId: req.user.id,
      projectId: project.id,
      targetUserId: body.userId,
    });
    res.status(201).json({ success: true, data: view });
  })
);

// PATCH .../access/users/:userId
router.patch(
  '/users/:userId',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user || !req.scope?.workspaceId) {
      throw new AppError('Workspace scope missing', 500);
    }
    const userId = z.string().uuid().parse(req.params.userId);
    const body = UpdateUserSchema.parse(req.body);
    const project = await resolveProject(req);
    const view = await updateUserGrant({
      projectId: project.id,
      workspaceId: req.scope.workspaceId,
      userId,
      role: body.role,
    });
    logger.info('Updated project user grant', {
      actingUserId: req.user.id,
      projectId: project.id,
      targetUserId: userId,
    });
    res.json({ success: true, data: view });
  })
);

// DELETE .../access/users/:userId
router.delete(
  '/users/:userId',
  authorize('admin'),
  requireActiveTenant,
  requireActiveWorkspace,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError('Auth missing', 500);
    const userId = z.string().uuid().parse(req.params.userId);
    const project = await resolveProject(req);
    const view = await removeUserGrant({ projectId: project.id, userId });
    logger.info('Removed project user grant', {
      actingUserId: req.user.id,
      projectId: project.id,
      targetUserId: userId,
    });
    res.json({ success: true, data: view });
  })
);

export default router;
