import { AppError } from '../../lib/errors.js';
import * as teamService from '../../services/teamService.js';
import type { TeamView } from '../../services/teamService.js';

export async function getTeam(input: {
  workspaceId: string;
  teamSlug: string;
}): Promise<TeamView> {
  const team = await teamService.getBySlug(input.workspaceId, input.teamSlug);
  if (!team) throw new AppError(`Team '${input.teamSlug}' not found`, 404);
  const view = await teamService.viewById(team.id);
  if (!view) throw new AppError(`Team '${input.teamSlug}' not found`, 404);
  return view;
}
