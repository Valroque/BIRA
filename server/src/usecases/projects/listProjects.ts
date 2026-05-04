import * as projectService from '../../services/projectService.js';
import type { Project } from '../../entities/Project.js';

export async function listProjects(workspaceId: string): Promise<Project[]> {
  return projectService.listByWorkspace(workspaceId);
}
