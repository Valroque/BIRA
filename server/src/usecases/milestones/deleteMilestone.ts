import { AppError } from '../../lib/errors.js';
import * as milestoneService from '../../services/milestoneService.js';

/**
 * Hard-delete a milestone. Look up first so cross-workspace ids return
 * 404 (no info leak) and so the response is a clean 204 once we've
 * confirmed the row exists in scope.
 */
export async function deleteMilestone(workspaceId: string, id: string): Promise<void> {
  const existing = await milestoneService.getById(id);
  if (!existing || existing.workspaceId !== workspaceId) {
    throw new AppError(`Milestone '${id}' not found`, 404);
  }
  const deleted = await milestoneService.deleteById(id);
  if (!deleted) {
    // Race: row was deleted between our lookup and our delete. Treat
    // as not-found rather than 500 — the desired post-state is reached
    // either way, and surfacing 404 lets the caller refresh.
    throw new AppError(`Milestone '${id}' not found`, 404);
  }
}
