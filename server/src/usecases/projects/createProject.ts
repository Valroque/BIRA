import { AppError } from '../../lib/errors.js';
import * as projectService from '../../services/projectService.js';
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

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const existing = await projectService.findBySlug(input.workspaceId, input.slug);
  if (existing) {
    throw new AppError(`A project with slug '${input.slug}' already exists`, 409);
  }
  return projectService.create(input);
}
