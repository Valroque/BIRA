import * as teamService from '../../services/teamService.js';
import type { TeamView } from '../../services/teamService.js';

export async function listTeams(input: { workspaceId: string }): Promise<TeamView[]> {
  return teamService.listForWorkspace(input.workspaceId);
}
