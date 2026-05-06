import { AppError } from '../../lib/errors.js';
import * as teamService from '../../services/teamService.js';
import type { TeamView } from '../../services/teamService.js';

export interface CreateTeamInput {
  workspaceId: string;
  slug: string;
  name: string;
  description?: string;
  color: string;
  createdByUserId: string;
}

export async function createTeam(input: CreateTeamInput): Promise<TeamView> {
  const existing = await teamService.getBySlug(input.workspaceId, input.slug);
  if (existing) {
    throw new AppError(`A team with slug '${input.slug}' already exists`, 409);
  }
  const team = await teamService.create(input);
  const view = await teamService.viewById(team.id);
  if (!view) throw new AppError('Failed to read back team', 500);
  return view;
}
