import * as projectService from '../../services/projectService.js';
import type { Project } from '../../entities/Project.js';

export interface ListProjectsOptions {
  /** Include archived projects in the result. Default false. */
  includeArchived?: boolean;
}

export async function listProjects(
  workspaceId: string,
  opts: ListProjectsOptions = {}
): Promise<Project[]> {
  return projectService.listByWorkspace(workspaceId, opts);
}
