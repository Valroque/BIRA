import { AppError } from '../../lib/errors.js';
import * as issueService from '../../services/issueService.js';
import type { Issue } from '../../entities/Issue.js';
import {
  STATUSES,
  PRIORITIES,
  type StatusId,
  type Priority,
  type Role,
} from '../../lib/constants.js';
import { evaluateTransition } from '../workflows/evaluateTransition.js';
import { validateAttachmentRefs } from '../../lib/validateAttachmentRefs.js';

export interface UpdateIssuePatch {
  title?: string;
  description?: string | null;
  status?: StatusId;
  priority?: Priority;
  assigneeUserId?: string | null;
  labels?: string[];
  startDate?: string | null;
  endDate?: string | null;
  estimate?: number | null;
  // Slice C — `attachment:<uuid>` refs to files in the same workspace.
  // Replace-semantics: the array passed in fully replaces what's stored.
  descriptionAttachmentIds?: string[];
}

const MAX_DESCRIPTION_ATTACHMENTS = 20;

/**
 * Acting context for the workflow status guard. When provided and the
 * patch includes a status change, `evaluateTransition` is consulted
 * before the write.
 *
 * If `actingUserId` is omitted (e.g. an internal system call) the
 * guard is skipped — keeps the seeders / migrations from needing to
 * fabricate user identity. The HTTP route ALWAYS supplies it.
 */
export interface UpdateIssueActingContext {
  actingUserId?: string;
  actingUserRole?: Role | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Update an issue by key. Status changes are validated against the
 * project's workflow (via `evaluateTransition`) when actor context is
 * supplied; same-status patches and unguarded internal calls bypass.
 *
 * `parentIssueId` is intentionally NOT in the patch shape — hierarchy
 * mutations go through `setIssueParent`. Schedule (start/end) and
 * `estimate` are gated by issue type (Tasks/Bugs only).
 */
export async function updateIssue(
  workspaceId: string,
  key: string,
  patch: UpdateIssuePatch,
  actor: UpdateIssueActingContext = {}
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
  if (patch.startDate !== undefined && patch.startDate !== null && !ISO_DATE_RE.test(patch.startDate)) {
    throw new AppError('startDate must be YYYY-MM-DD', 400);
  }
  if (patch.endDate !== undefined && patch.endDate !== null && !ISO_DATE_RE.test(patch.endDate)) {
    throw new AppError('endDate must be YYYY-MM-DD', 400);
  }
  if (patch.estimate !== undefined && patch.estimate !== null) {
    if (!Number.isInteger(patch.estimate) || patch.estimate < 0) {
      throw new AppError('estimate must be a non-negative integer', 400);
    }
  }

  // Slice C — description attachment refs. Mirrors createIssue: max 20,
  // workspace-scoped existence check, allowed on every issue type.
  if (patch.descriptionAttachmentIds !== undefined) {
    if (!Array.isArray(patch.descriptionAttachmentIds)) {
      throw new AppError('descriptionAttachmentIds must be an array', 400);
    }
    if (patch.descriptionAttachmentIds.length > MAX_DESCRIPTION_ATTACHMENTS) {
      throw new AppError(
        `at most ${MAX_DESCRIPTION_ATTACHMENTS} description attachments are allowed`,
        400
      );
    }
    if (patch.descriptionAttachmentIds.length > 0) {
      await validateAttachmentRefs(workspaceId, patch.descriptionAttachmentIds);
    }
  }

  const existing = await issueService.findByKey(workspaceId, key);
  if (!existing) {
    throw new AppError(`Issue '${key}' not found`, 404);
  }

  // Type gates: schedules + estimates live on Tasks and Bugs only.
  const isLeaf = existing.type === 'T' || existing.type === 'B';
  if (!isLeaf) {
    if (patch.startDate !== undefined || patch.endDate !== undefined) {
      throw new AppError('Schedules live on Tasks and Bugs only', 400);
    }
    if (patch.estimate !== undefined) {
      throw new AppError(
        'Effort estimates are not set on Stories or Epics — they roll up from leaves',
        400
      );
    }
  }

  // Cross-field date sanity. The DB CHECK catches this too, but a 400
  // with a friendlier message beats a generic 500-shaped constraint
  // violation rendered by the global handler.
  const finalStart =
    patch.startDate !== undefined ? patch.startDate : existing.startDate;
  const finalEnd = patch.endDate !== undefined ? patch.endDate : existing.endDate;
  if (finalStart && finalEnd && finalEnd < finalStart) {
    throw new AppError('endDate must be on or after startDate', 400);
  }

  // Workflow status guard (slice 5). Skipped when actor context is
  // missing (internal callers) or when status is unchanged.
  if (
    patch.status !== undefined &&
    patch.status !== existing.status &&
    actor.actingUserId
  ) {
    const result = await evaluateTransition({
      issue: existing,
      toStatus: patch.status,
      actingUserId: actor.actingUserId,
      actingUserRole: actor.actingUserRole ?? null,
    });
    if (!result.allowed) {
      throw new AppError(result.reason ?? 'Transition not allowed', 403);
    }
    // result.noWorkflow === true → permissive fallback. Could log here;
    // staying quiet for now to keep test output clean.
  }

  const updated = await issueService.updateById(existing.id, patch);
  if (!updated) {
    throw new AppError(`Issue '${key}' not found`, 404);
  }
  return updated;
}
