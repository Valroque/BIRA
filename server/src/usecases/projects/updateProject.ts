import { AppError } from '../../lib/errors.js';
import * as projectService from '../../services/projectService.js';
import type { Project } from '../../entities/Project.js';

export interface UpdateProjectInput {
  projectId: string;
  patch: {
    name?: string;
    letter?: string;
    color?: string;
    bg?: string;
    description?: string;
  };
}

export async function updateProject(input: UpdateProjectInput): Promise<Project> {
  const project = await projectService.update(input.projectId, input.patch);
  if (!project) throw new AppError('Project not found', 404);
  return project;
}
