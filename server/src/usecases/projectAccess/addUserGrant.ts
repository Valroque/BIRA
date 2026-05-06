import * as projectAccessService from '../../services/projectAccessService.js';
import type { ProjectAccessView } from '../../services/projectAccessService.js';
import type { Role } from '../../lib/constants.js';

export interface AddUserGrantInput {
  projectId: string;
  workspaceId: string;
  tenantId: string;
  userId: string;
  role: Role;
}

export async function addUserGrant(input: AddUserGrantInput): Promise<ProjectAccessView> {
  await projectAccessService.addUserAccess({
    projectId: input.projectId,
    userId: input.userId,
    role: input.role,
    workspaceId: input.workspaceId,
    tenantId: input.tenantId,
  });
  return projectAccessService.listAccess(input.projectId);
}
