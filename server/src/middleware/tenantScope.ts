import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { roleAtLeast, type Role } from '../lib/constants.js';
import * as tenantService from '../services/tenantService.js';
import * as workspaceService from '../services/workspaceService.js';
import * as membershipService from '../services/membershipService.js';

/**
 * resolveTenantScope — runs after `authenticate`. Reads `:tenantSlug` from
 * URL params, validates that the user has an active membership in that
 * tenant, and attaches `req.scope = { tenantId, tenantSlug, role }`.
 *
 * 404 if the tenant slug doesn't exist.
 * 403 if the user has no active membership in that tenant.
 *
 * Mount on routers like: `/api/tenants/:tenantSlug/...`
 */
export const resolveTenantScope: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.user) throw new AppError('Authentication required', 401);

    const tenantSlug = req.params.tenantSlug;
    if (!tenantSlug) throw new AppError('Tenant slug missing in URL', 400);

    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) throw new AppError(`Tenant '${tenantSlug}' not found`, 404);

    const tm = await membershipService.getTenantMembership(req.user.id, tenant.id);
    if (!tm || tm.status !== 'active') {
      throw new AppError('Access denied — no active membership in this tenant', 403);
    }

    req.scope = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantRole: tm.role,
      role: tm.role,
    };
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * resolveWorkspaceScope — runs after `resolveTenantScope`. Reads
 * `:workspaceSlug` from URL params, resolves the effective role using the
 * resolution rules (tenant admin wins; otherwise explicit workspace
 * membership), and updates `req.scope`.
 *
 * 404 if the workspace slug doesn't exist within the tenant.
 * 403 if the user has no effective role in this workspace.
 */
export const resolveWorkspaceScope: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.user || !req.scope) {
      throw new AppError('Tenant scope must be resolved first', 500);
    }
    const workspaceSlug = req.params.workspaceSlug;
    if (!workspaceSlug) throw new AppError('Workspace slug missing in URL', 400);

    const workspace = await workspaceService.findBySlug(req.scope.tenantId, workspaceSlug);
    if (!workspace) {
      throw new AppError(`Workspace '${workspaceSlug}' not found in this tenant`, 404);
    }

    const role = await membershipService.resolveEffectiveWorkspaceRole(
      req.user.id,
      workspace.id,
      req.scope.tenantId
    );
    if (!role) {
      throw new AppError('Access denied — no role in this workspace', 403);
    }

    req.scope = {
      ...req.scope,
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      workspaceStatus: workspace.status,
      role,
    };
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * requireActiveWorkspace — gate write paths on workspace status. Mount on
 * any handler that mutates workspace-scoped data; archived workspaces are
 * frozen and return 409 here. Must run after `resolveWorkspaceScope`.
 */
export const requireActiveWorkspace: RequestHandler = (req, _res, next) => {
  if (!req.scope?.workspaceId) {
    next(new AppError('Workspace scope must be resolved first', 500));
    return;
  }
  if (req.scope.workspaceStatus !== 'active') {
    next(
      new AppError(
        `Workspace '${req.scope.workspaceSlug}' is archived — unarchive it before making changes`,
        409
      )
    );
    return;
  }
  next();
};

/**
 * authorize(required) — gate a handler on the user's role in `req.scope`.
 * Uses the role ladder: read < write < admin. Must be mounted after
 * `resolveTenantScope` (and `resolveWorkspaceScope` for workspace-scoped
 * routes).
 */
export function authorize(required: Role): RequestHandler {
  return (req, _res, next) => {
    if (!req.scope) {
      next(new AppError('Scope must be resolved first', 500));
      return;
    }
    if (!roleAtLeast(req.scope.role, required)) {
      next(
        new AppError(
          `Access denied — requires role '${required}' or higher (you have '${req.scope.role}')`,
          403
        )
      );
      return;
    }
    next();
  };
}
