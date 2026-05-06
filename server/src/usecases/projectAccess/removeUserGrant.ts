import { AppError } from '../../lib/errors.js';
import * as projectAccessService from '../../services/projectAccessService.js';
import type { ProjectAccessView } from '../../services/projectAccessService.js';

export interface RemoveUserGrantInput {
  projectId: string;
  userId: string;
}

export async function removeUserGrant(input: RemoveUserGrantInput): Promise<ProjectAccessView> {
  const ok = await projectAccessService.removeUserAccess({
    projectId: input.projectId,
    userId: input.userId,
  });
  if (!ok) throw new AppError('User access grant not found', 404);
  return projectAccessService.listAccess(input.projectId);
}
