import { AppError } from '../../lib/errors.js';
import * as projectService from '../../services/projectService.js';
import type { Project } from '../../entities/Project.js';
import type { ProjectStatus } from '../../lib/constants.js';

/**
 * Flip a project's status. Archive freezes the project (issue + workflow
 * mutations should be blocked at the route level when status !== active);
 * unarchive restores it. No data is destroyed in either direction.
 * Idempotent — flipping to the current status is a no-op that still
 * returns the project.
 */
export async function setProjectStatus(
  projectId: string,
  status: ProjectStatus
): Promise<Project> {
  const updated = await projectService.setStatus(projectId, status);
  if (!updated) throw new AppError('Project not found', 404);
  return updated;
}
