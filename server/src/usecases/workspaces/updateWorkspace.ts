import { AppError } from '../../lib/errors.js';
import * as workspaceService from '../../services/workspaceService.js';
import type { Workspace } from '../../entities/Workspace.js';

export interface UpdateWorkspaceInput {
  workspaceId: string;
  patch: {
    name?: string;
    letter?: string;
    color?: string;
    bg?: string;
  };
}

export async function updateWorkspace(input: UpdateWorkspaceInput): Promise<Workspace> {
  const workspace = await workspaceService.update(input.workspaceId, input.patch);
  if (!workspace) throw new AppError('Workspace not found', 404);
  return workspace;
}
