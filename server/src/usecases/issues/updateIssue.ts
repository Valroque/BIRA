import { AppError } from '../../lib/errors.js';
import * as issueService from '../../services/issueService.js';
import type { Issue } from '../../entities/Issue.js';
import {
  STATUSES,
  PRIORITIES,
  type StatusId,
  type Priority,
} from '../../lib/constants.js';

export interface UpdateIssuePatch {
  title?: string;
  description?: string | null;
  status?: StatusId;
  priority?: Priority;
  assigneeUserId?: string | null;
  labels?: string[];
}

/**
 * Update an issue by id. Status transitions are NOT validated against any
 * workflow yet — slice 5 will introduce the workflow guard. For now any
 * value within the closed STATUSES enum is accepted.
 */
export async function updateIssue(
  workspaceId: string,
  key: string,
  patch: UpdateIssuePatch
): Promise<Issue> {
  const provided = Object.keys(patch).filter(
    (k) => (patch as Record<string, unknown>)[k] !== undefined
  );
  if (provided.length === 0) {
    throw new AppError('At least one field must be provided', 400);
  }

  if (patch.status !== undefined && !STATUSES.includes(patch.status)) {
    throw new AppError(`Invalid status '${patch.status}'`, 400);
  }
  if (patch.priority !== undefined && !PRIORITIES.includes(patch.priority)) {
    throw new AppError(`Invalid priority '${patch.priority}'`, 400);
  }
  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw new AppError('title cannot be empty', 400);
    if (patch.title.length > 500) {
      throw new AppError('title must be 500 characters or fewer', 400);
    }
  }

  const existing = await issueService.findByKey(workspaceId, key);
  if (!existing) {
    throw new AppError(`Issue '${key}' not found`, 404);
  }

  const updated = await issueService.updateById(existing.id, patch);
  if (!updated) {
    throw new AppError(`Issue '${key}' not found`, 404);
  }
  return updated;
}
