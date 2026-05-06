import { AppError } from '../../lib/errors.js';
import * as projectAccessService from '../../services/projectAccessService.js';
import type { ProjectAccessView } from '../../services/projectAccessService.js';

export interface RemoveTeamGrantInput {
  projectId: string;
  teamId: string;
}

export async function removeTeamGrant(input: RemoveTeamGrantInput): Promise<ProjectAccessView> {
  const ok = await projectAccessService.removeTeamAccess({
    projectId: input.projectId,
    teamId: input.teamId,
  });
  if (!ok) throw new AppError('Team access grant not found', 404);
  return projectAccessService.listAccess(input.projectId);
}
