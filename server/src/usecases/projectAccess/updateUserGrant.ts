import * as projectAccessService from '../../services/projectAccessService.js';
import type { ProjectAccessView } from '../../services/projectAccessService.js';
import type { Role } from '../../lib/constants.js';

export interface UpdateUserGrantInput {
  projectId: string;
  workspaceId: string;
  userId: string;
  role: Role;
}

export async function updateUserGrant(input: UpdateUserGrantInput): Promise<ProjectAccessView> {
  await projectAccessService.updateUserAccessRole({
    projectId: input.projectId,
    userId: input.userId,
    role: input.role,
  });
  return projectAccessService.listAccess(input.projectId);
}
