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
}

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
      },
      trx
    );
  });
}
