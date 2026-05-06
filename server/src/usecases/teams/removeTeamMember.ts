import { AppError } from '../../lib/errors.js';
import * as teamService from '../../services/teamService.js';
import type { TeamView } from '../../services/teamService.js';

export interface RemoveTeamMemberInput {
  workspaceId: string;
  teamSlug: string;
  userId: string;
}

export async function removeTeamMember(input: RemoveTeamMemberInput): Promise<TeamView> {
  const team = await teamService.getBySlug(input.workspaceId, input.teamSlug);
  if (!team) throw new AppError(`Team '${input.teamSlug}' not found`, 404);
  const ok = await teamService.removeMember({ teamId: team.id, userId: input.userId });
  if (!ok) throw new AppError('User is not a member of this team', 404);
  const view = await teamService.viewById(team.id);
  if (!view) throw new AppError('Failed to read back team', 500);
  return view;
}
