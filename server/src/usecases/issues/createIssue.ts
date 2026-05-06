import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import * as issueService from '../../services/issueService.js';
import type { Issue } from '../../entities/Issue.js';
import {
  ISSUE_TYPES,
  STATUSES,
  PRIORITIES,
  type IssueType,
  type StatusId,
  type Priority,
} from '../../lib/constants.js';
import { parentIsRequired, validateParentAssignment } from './hierarchyRules.js';
import { validateAttachmentRefs } from '../../lib/validateAttachmentRefs.js';

export interface CreateIssueInput {
  workspaceId: string;
  projectId: string;
  type: IssueType;
  title: string;
  description?: string | null;
  status?: StatusId;
  priority?: Priority;
  labels?: string[];
  assigneeUserId?: string | null;
  reporterUserId?: string | null;
  parentIssueId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  estimate?: number | null;
  // Slice C — `attachment:<uuid>` refs to files in the same workspace.
  descriptionAttachmentIds?: string[];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Descriptions tend to carry more inline images than comments — bumped
// from the 10 used for comment attachments.
const MAX_DESCRIPTION_ATTACHMENTS = 20;

interface ProjectRowMin {
  id: string;
  workspaceId: string;
  key: string;
}

/**
 * Atomically allocates the next per-project issue number, builds the
 * human-readable key (`{projectKey}-{seq}`), and inserts the issue inside
 * a single transaction so concurrent calls within the same project never
 * collide on `(project_id, seq)`.
 *
 * Seq allocation is delegated to Postgres: a single
 * `UPDATE ... RETURNING (next_issue_number - 1)` increments the counter
 * and returns the freshly-claimed value in one round trip. Row-level
 * locking is implicit — concurrent UPDATEs serialise on the same row,
 * so two parallel creates can never read the same seq. No SELECT FOR
 * UPDATE needed.
 *
 * Status transitions are NOT validated against any workflow here — that's
 * a later slice. `status` is freely settable on create.
 */
export async function createIssue(input: CreateIssueInput): Promise<Issue> {
  if (!ISSUE_TYPES.includes(input.type)) {
    throw new AppError(`Invalid issue type '${input.type}'`, 400);
  }
  if (input.status && !STATUSES.includes(input.status)) {
    throw new AppError(`Invalid status '${input.status}'`, 400);
  }
  if (input.priority && !PRIORITIES.includes(input.priority)) {
    throw new AppError(`Invalid priority '${input.priority}'`, 400);
  }
  if (!input.title || !input.title.trim()) {
    throw new AppError('title is required', 400);
  }
  if (input.title.length > 500) {
    throw new AppError('title must be 500 characters or fewer', 400);
  }

  // Type-gate schedule + estimate. Stories/Epics roll up from leaves.
  const isLeaf = input.type === 'T' || input.type === 'B';
  if (!isLeaf) {
    if (input.startDate !== undefined && input.startDate !== null) {
      throw new AppError('Schedules live on Tasks and Bugs only', 400);
    }
    if (input.endDate !== undefined && input.endDate !== null) {
      throw new AppError('Schedules live on Tasks and Bugs only', 400);
    }
    if (input.estimate !== undefined && input.estimate !== null) {
      throw new AppError(
        'Effort estimates are not set on Stories or Epics — they roll up from leaves',
        400
      );
    }
  }
  if (input.startDate !== undefined && input.startDate !== null && !ISO_DATE_RE.test(input.startDate)) {
    throw new AppError('startDate must be YYYY-MM-DD', 400);
  }
  if (input.endDate !== undefined && input.endDate !== null && !ISO_DATE_RE.test(input.endDate)) {
    throw new AppError('endDate must be YYYY-MM-DD', 400);
  }
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new AppError('endDate must be on or after startDate', 400);
  }
  if (input.estimate !== undefined && input.estimate !== null) {
    if (!Number.isInteger(input.estimate) || input.estimate < 0) {
      throw new AppError('estimate must be a non-negative integer', 400);
    }
  }

  // Slice C — description attachment refs. Allowed on every issue type
  // (descriptions exist on T/B/S/E alike). Format + workspace-scoped
  // existence is checked here so the failure points at the bad ref
  // before we open the trx.
  if (input.descriptionAttachmentIds !== undefined) {
    if (!Array.isArray(input.descriptionAttachmentIds)) {
      throw new AppError('descriptionAttachmentIds must be an array', 400);
    }
    if (input.descriptionAttachmentIds.length > MAX_DESCRIPTION_ATTACHMENTS) {
      throw new AppError(
        `at most ${MAX_DESCRIPTION_ATTACHMENTS} description attachments are allowed`,
        400
      );
    }
    if (input.descriptionAttachmentIds.length > 0) {
      await validateAttachmentRefs(input.workspaceId, input.descriptionAttachmentIds);
    }
  }

  // Stories require an Epic parent at creation. Other types accept an
  // optional parent (validated below inside the trx so it sees the
  // same projects/issues snapshot as the insert).
  if (input.parentIssueId === undefined || input.parentIssueId === null) {
    if (parentIsRequired(input.type)) {
      throw new AppError('Stories must be created under an Epic parent', 400);
    }
  }

  return db.transaction(async (trx) => {
    // Verify the project exists and belongs to the requested workspace
    // before we burn a seq number. Cross-workspace access is treated as
    // not-found (matches the projects router — no information leak).
    const project = (await trx('projects')
      .where('id', input.projectId)
      .select(['id', 'workspace_id', 'key'])
      .first()) as ProjectRowMin | undefined;

    if (!project) {
      throw new AppError(`Project '${input.projectId}' not found`, 404);
    }
    if (project.workspaceId !== input.workspaceId) {
      throw new AppError(`Project '${input.projectId}' not found in this workspace`, 404);
    }

    // Validate parent if one is provided. Run inside the trx so the
    // parent existence + project-scope checks are atomic with the
    // insert (no race where a parent disappears between the two).
    if (input.parentIssueId) {
      await validateParentAssignment({
        childIssueId: null,
        childType: input.type,
        parentIssueId: input.parentIssueId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        trx,
      });
    }

    // Atomic increment + read in one round trip. Postgres serialises
    // concurrent UPDATEs to the same row, so two parallel creates can
    // never claim the same seq. The returned value is the seq we own.
    const [seqRow] = (await trx.raw(
      `UPDATE projects
         SET next_issue_number = next_issue_number + 1,
             updated_at = NOW()
       WHERE id = ?
       RETURNING next_issue_number - 1 AS seq`,
      [input.projectId]
    )).rows as Array<{ seq: number }>;
    const seq = seqRow.seq;

    const key = `${project.key}-${seq}`;

    return issueService.create(
      {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        key,
        seq,
        type: input.type,
        status: input.status ?? 'backlog',
        priority: input.priority ?? 'none',
        title: input.title,
        description: input.description ?? null,
        labels: input.labels ?? [],
        assigneeUserId: input.assigneeUserId ?? null,
        reporterUserId: input.reporterUserId ?? null,
        parentIssueId: input.parentIssueId ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        estimate: input.estimate ?? null,
        descriptionAttachmentIds: input.descriptionAttachmentIds ?? [],
      },
      trx
    );
  });
}
