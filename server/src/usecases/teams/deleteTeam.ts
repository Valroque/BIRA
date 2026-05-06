import { AppError } from '../../lib/errors.js';
import * as teamService from '../../services/teamService.js';

export async function deleteTeam(input: {
  workspaceId: string;
  teamSlug: string;
}): Promise<void> {
  const team = await teamService.getBySlug(input.workspaceId, input.teamSlug);
  if (!team) throw new AppError(`Team '${input.teamSlug}' not found`, 404);
  // Cascades:
  //   - team_memberships rows for this team (FK CASCADE on team_id).
  //   - project_team_access rows for this team (FK CASCADE, Domain C).
  // Both happen at the DB level — no application-side cleanup needed.
  const ok = await teamService.remove(team.id);
  if (!ok) throw new AppError('Failed to delete team', 500);
}
