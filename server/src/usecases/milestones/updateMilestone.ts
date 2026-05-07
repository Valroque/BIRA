import { AppError } from '../../lib/errors.js';
import * as milestoneService from '../../services/milestoneService.js';
import type { Milestone } from '../../entities/Milestone.js';

export interface UpdateMilestonePatch {
  name?: string;
  description?: string | null;
  date?: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Update a milestone. Look up first so cross-workspace ids return 404
 * before any write. The route's Zod refine catches empty patches; this
 * keeps a defensive guard so direct callers (seeders, future usecases)
 * still get a friendly 400.
 */
export async function updateMilestone(
  workspaceId: string,
  id: string,
  patch: UpdateMilestonePatch
): Promise<Milestone> {
  const provided = Object.keys(patch).filter(
    (k) => (patch as Record<string, unknown>)[k] !== undefined
  );
  if (provided.length === 0) {
    throw new AppError('At least one field must be provided', 400);
  }

  if (patch.name !== undefined) {
    if (!patch.name.trim()) {
      throw new AppError('name cannot be empty', 400);
    }
    if (patch.name.length > 200) {
      throw new AppError('name must be 200 characters or fewer', 400);
    }
  }
  if (
    patch.description !== undefined &&
    patch.description !== null &&
    patch.description.length > 2000
  ) {
    throw new AppError('description must be 2000 characters or fewer', 400);
  }
  if (patch.date !== undefined && !ISO_DATE_RE.test(patch.date)) {
    throw new AppError('date must be YYYY-MM-DD', 400);
  }

  const existing = await milestoneService.getById(id);
  if (!existing || existing.workspaceId !== workspaceId) {
    throw new AppError(`Milestone '${id}' not found`, 404);
  }

  const updated = await milestoneService.updateById(id, patch);
  if (!updated) {
    throw new AppError(`Milestone '${id}' not found`, 404);
  }
  return updated;
}
