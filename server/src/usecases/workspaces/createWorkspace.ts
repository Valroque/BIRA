import { AppError } from '../../lib/errors.js';
import * as workspaceService from '../../services/workspaceService.js';
import type { Workspace } from '../../entities/Workspace.js';

export interface CreateWorkspaceInput {
  tenantId: string;
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  const existing = await workspaceService.findBySlug(input.tenantId, input.slug);
  if (existing) {
    throw new AppError(`A workspace with slug '${input.slug}' already exists`, 409);
  }
  return workspaceService.create(input);
}
