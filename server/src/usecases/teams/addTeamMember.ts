import { AppError } from '../../lib/errors.js';
import * as teamService from '../../services/teamService.js';
import type { TeamView } from '../../services/teamService.js';

export interface AddTeamMemberInput {
  workspaceId: string;
  teamSlug: string;
  userId: string;
}

export async function addTeamMember(input: AddTeamMemberInput): Promise<TeamView> {
  const team = await teamService.getBySlug(input.workspaceId, input.teamSlug);
  if (!team) throw new AppError(`Team '${input.teamSlug}' not found`, 404);
  await teamService.addMember({
    teamId: team.id,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  const view = await teamService.viewById(team.id);
  if (!view) throw new AppError('Failed to read back team', 500);
  return view;
}
