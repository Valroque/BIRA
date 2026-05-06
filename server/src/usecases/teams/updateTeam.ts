import { AppError } from '../../lib/errors.js';
import * as teamService from '../../services/teamService.js';
import type { TeamView } from '../../services/teamService.js';

export interface UpdateTeamInput {
  workspaceId: string;
  teamSlug: string;
  patch: {
    name?: string;
    description?: string;
    color?: string;
  };
}

export async function updateTeam(input: UpdateTeamInput): Promise<TeamView> {
  const team = await teamService.getBySlug(input.workspaceId, input.teamSlug);
  if (!team) throw new AppError(`Team '${input.teamSlug}' not found`, 404);
  const updated = await teamService.update(team.id, input.patch);
  if (!updated) throw new AppError('Failed to update team', 500);
  const view = await teamService.viewById(updated.id);
  if (!view) throw new AppError('Failed to read back team', 500);
  return view;
}
