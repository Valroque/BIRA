import * as milestoneService from '../../services/milestoneService.js';
import type { Milestone } from '../../entities/Milestone.js';
import type { MilestoneFilters } from '../../services/milestoneService.js';

/**
 * Thin wrappers around the service. Routes call the project-scoped variant
 * for the project tab and the workspace-scoped variant for portfolio-level
 * views (planner, future "milestones across all projects" page). Both
 * order by date ascending — soonest first.
 */
export async function listMilestonesByProject(
  projectId: string,
  filters: MilestoneFilters = {}
): Promise<Milestone[]> {
  return milestoneService.listByProject(projectId, filters);
}

export async function listMilestonesByWorkspace(
  workspaceId: string,
  filters: MilestoneFilters = {}
): Promise<Milestone[]> {
  return milestoneService.listByWorkspace(workspaceId, filters);
}
