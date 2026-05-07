import { AppError } from '../../lib/errors.js';
import * as milestoneService from '../../services/milestoneService.js';
import * as projectService from '../../services/projectService.js';
import type { Milestone } from '../../entities/Milestone.js';

export interface CreateMilestoneInput {
  workspaceId: string;
  projectId: string;
  name: string;
  description?: string | null;
  date: string; // YYYY-MM-DD
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Create a milestone. Verifies the project exists AND lives in the same
 * workspace as the caller — cross-workspace = 404, no info leak. The
 * description nullable optional shape mirrors the FE: omitted means "no
 * description"; explicit null clears it on update.
 *
 * Length / shape validation is handled in two places: the route's Zod
 * schema rejects malformed input before this runs, and the DB CHECK
 * constraints catch any stray writes that bypass the route. The
 * usecase keeps a thin trim-and-bounds check so direct service callers
 * (seeders, other usecases) get a friendlier 400 than a constraint
 * violation.
 */
export async function createMilestone(input: CreateMilestoneInput): Promise<Milestone> {
  if (!input.name || !input.name.trim()) {
    throw new AppError('name is required', 400);
  }
  if (input.name.length > 200) {
    throw new AppError('name must be 200 characters or fewer', 400);
  }
  if (
    input.description !== undefined &&
    input.description !== null &&
    input.description.length > 2000
  ) {
    throw new AppError('description must be 2000 characters or fewer', 400);
  }
  if (!ISO_DATE_RE.test(input.date)) {
    throw new AppError('date must be YYYY-MM-DD', 400);
  }

  // Project existence + workspace-scope check. Mirrors the createIssue
  // posture: cross-workspace is treated as not-found (no info leak).
  // Single-statement read, no JOIN.
  const project = await projectService.getById(input.projectId);
  if (!project || project.workspaceId !== input.workspaceId) {
    throw new AppError(`Project '${input.projectId}' not found`, 404);
  }

  return milestoneService.create({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    name: input.name,
    description: input.description ?? null,
    date: input.date,
  });
}
