import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import * as projectService from '../../services/projectService.js';
import * as projectAccessService from '../../services/projectAccessService.js';
import type { Project } from '../../entities/Project.js';
import type { ProjectStatus } from '../../lib/constants.js';

export interface CreateProjectInput {
  workspaceId: string;
  slug: string;
  key: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
  description?: string;
  status?: ProjectStatus;
  createdByUserId?: string | null;
}

/**
 * Create a project and, if a creator is identified, atomically grant
 * them admin role on the new project. Both inserts run inside one
 * transaction — if the grant fails (e.g. constraint violation), the
 * project insert rolls back too. This keeps a tenant from ending up
 * with a project that has no explicit admin.
 *
 * Tenant admins and workspace admins inherit project admin via
 * `computeEffectiveMembers`, so the explicit grant is redundant for
 * them. We still write it: it makes the creator a first-class
 * `project_user_access` row, which is what the Members page uses to
 * decide who shows up. Without it, a creator who was a workspace
 * `write` member wouldn't appear at all in their own project's
 * Members tab — even though they made the project.
 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  const existing = await projectService.findBySlug(input.workspaceId, input.slug);
  if (existing) {
    throw new AppError(`A project with slug '${input.slug}' already exists`, 409);
  }
  return db.transaction(async (trx) => {
    const project = await projectService.create(input, trx);
    if (input.createdByUserId) {
      await projectAccessService.insertUserAccessInTx(
        {
          projectId: project.id,
          userId: input.createdByUserId,
          role: 'admin',
        },
        trx
      );
    }
    return project;
  });
}
