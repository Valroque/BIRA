import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import * as workspaceService from '../../services/workspaceService.js';
import { seedDefaultWorkflowsForWorkspace } from '../../lib/defaultWorkflows.js';
import type { Workspace } from '../../entities/Workspace.js';

export interface CreateWorkspaceInput {
  tenantId: string;
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
}

/**
 * Create a workspace and seed it with the three default workflows
 * (`default`, `epic-coarse`, `epic-detailed`) — both are committed in a
 * single DB transaction. If the workflow seed fails, the workspace insert
 * rolls back too, so the tenant never sees a workspace with no workflows.
 *
 * The fallback chain in `getProjectWorkflows.ts` then resolves
 * (project, issue_type) → workflow without any explicit
 * `project_workflows` row, so projects created in the new workspace work
 * end-to-end without further configuration.
 */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  return db.transaction(async (trx) => {
    const existing = await workspaceService.findBySlug(input.tenantId, input.slug, trx);
    if (existing) {
      throw new AppError(`A workspace with slug '${input.slug}' already exists`, 409);
    }
    const workspace = await workspaceService.create(input, trx);
    await seedDefaultWorkflowsForWorkspace(trx, workspace.id);
    return workspace;
  });
}
