import * as projectAccessService from '../../services/projectAccessService.js';
import type { ProjectAccessView } from '../../services/projectAccessService.js';

export interface AddTeamGrantInput {
  projectId: string;
  workspaceId: string;
  teamId: string;
  role: 'write' | 'read';
}

export async function addTeamGrant(input: AddTeamGrantInput): Promise<ProjectAccessView> {
  await projectAccessService.addTeamAccess({
    projectId: input.projectId,
    teamId: input.teamId,
    role: input.role,
    workspaceId: input.workspaceId,
  });
  return projectAccessService.listAccess(input.projectId);
}
