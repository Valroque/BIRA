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
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface ProjectRowMin {
  id: string;
  workspaceId: string;
  key: string;
  nextIssueNumber: number;
}

/**
 * Atomically allocates the next per-project issue number, builds the
 * human-readable key (`{projectKey}-{seq}`), and inserts the issue inside
 * a single transaction so concurrent calls within the same project never
 * collide on `(project_id, seq)`.
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

  // Stories require an Epic parent at creation. Other types accept an
  // optional parent (validated below inside the trx so it sees the
  // same projects/issues snapshot as the insert).
  if (input.parentIssueId === undefined || input.parentIssueId === null) {
    if (parentIsRequired(input.type)) {
      throw new AppError('Stories must be created under an Epic parent', 400);
    }
  }

  return db.transaction(async (trx) => {
    // Lock the project row + verify it belongs to the requested workspace.
    // FOR UPDATE serialises concurrent createIssue calls within a single
    // project; rows in *other* projects are unaffected.
    const project = (await trx('projects')
      .where('id', input.projectId)
      .select(['id', 'workspace_id', 'key', 'next_issue_number'])
      .forUpdate()
      .first()) as ProjectRowMin | undefined;

    if (!project) {
      throw new AppError(`Project '${input.projectId}' not found`, 404);
    }
    if (project.workspaceId !== input.workspaceId) {
      // Treat cross-workspace project access as not-found, matching the
      // behaviour of the projects router (no information leak).
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

    const seq = project.nextIssueNumber;
    await trx('projects')
      .where('id', input.projectId)
      .update({ nextIssueNumber: seq + 1, updatedAt: trx.fn.now() });

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
      },
      trx
    );
  });
}
