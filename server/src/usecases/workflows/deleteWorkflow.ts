import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import * as workflowService from '../../services/workflowService.js';

/**
 * Delete a workflow. Rejected (409) if any project_workflows row still
 * references it — the FK is ON DELETE RESTRICT at the DB level; this
 * usecase translates the underlying constraint into a friendlier
 * 409 with explicit messaging.
 */
export async function deleteWorkflow(workspaceId: string, slug: string): Promise<void> {
  return db.transaction(async (trx) => {
    const workflow = await workflowService.findBySlug(workspaceId, slug, trx);
    if (!workflow) throw new AppError(`Workflow '${slug}' not found`, 404);

    const refCount = (await trx('project_workflows')
      .where('workflow_id', workflow.id)
      .count<{ count: string }>('* as count')
      .first()) as { count: string } | undefined;

    if (refCount && Number(refCount.count) > 0) {
      throw new AppError(
        `Workflow '${slug}' is in use by one or more projects — reassign them before deleting`,
        409
      );
    }

    await workflowService.deleteById(workflow.id, trx);
  });
}
