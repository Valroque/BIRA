import * as projectAccessService from '../../services/projectAccessService.js';
import type { ProjectAccessView } from '../../services/projectAccessService.js';

export interface UpdateTeamGrantInput {
  projectId: string;
  teamId: string;
  role: 'write' | 'read';
}

export async function updateTeamGrant(input: UpdateTeamGrantInput): Promise<ProjectAccessView> {
  await projectAccessService.updateTeamAccessRole({
    projectId: input.projectId,
    teamId: input.teamId,
    role: input.role,
  });
  return projectAccessService.listAccess(input.projectId);
}
