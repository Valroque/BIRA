import * as milestoneService from '../../services/milestoneService.js';
import type { Milestone } from '../../entities/Milestone.js';

/**
 * Look up a milestone by id, scoped to a workspace. Cross-workspace
 * lookups (id exists but belongs to a different workspace) return null
 * just like genuine misses — no info leak about the existence of a
 * milestone outside the caller's scope.
 */
export async function getMilestone(
  workspaceId: string,
  id: string
): Promise<Milestone | null> {
  const milestone = await milestoneService.getById(id);
  if (!milestone) return null;
  if (milestone.workspaceId !== workspaceId) return null;
  return milestone;
}
