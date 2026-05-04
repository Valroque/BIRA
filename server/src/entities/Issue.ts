import { required, toISO } from './utils.js';
import { EntityError } from '../lib/errors.js';
import {
  ISSUE_TYPES,
  STATUSES,
  PRIORITIES,
  type IssueType,
  type StatusId,
  type Priority,
} from '../lib/constants.js';

export interface IssueRow {
  id: string;
  workspaceId: string;
  projectId: string;
  key: string;
  seq: number;
  type: IssueType;
  status: StatusId;
  priority: Priority;
  title: string;
  description: string | null;
  labels: string[];
  assigneeUserId: string | null;
  reporterUserId: string | null;
  parentIssueId: string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  estimate: number | null;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'Issue';

const KEY_RE = /^[A-Z0-9]+-\d+$/;

export class Issue {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly key: string;
  readonly seq: number;
  readonly type: IssueType;
  readonly status: StatusId;
  readonly priority: Priority;
  readonly title: string;
  readonly description: string | null;
  readonly labels: string[];
  readonly assigneeUserId: string | null;
  readonly reporterUserId: string | null;
  // The uuid of this issue's parent, or null. The hierarchy type rules
  // (Epics top-level, Stories under Epics, Tasks/Bugs leaves) are NOT
  // enforced at the entity layer because validation needs the parent
  // type — the usecase layer owns that. Entity stays a pure row mirror.
  readonly parentIssueId: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly estimate: number | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: IssueRow) {
    required(row.id, ENTITY, 'id');
    required(row.workspaceId, ENTITY, 'workspaceId');
    required(row.projectId, ENTITY, 'projectId');
    required(row.key, ENTITY, 'key');
    required(row.type, ENTITY, 'type');
    required(row.status, ENTITY, 'status');
    required(row.priority, ENTITY, 'priority');
    required(row.title, ENTITY, 'title');
    required(row.createdAt, ENTITY, 'createdAt');

    if (!KEY_RE.test(row.key)) {
      throw new EntityError(
        `Issue.key '${row.key}' must match {PROJECT_KEY}-{number}`,
        ENTITY,
        'key'
      );
    }
    if (!ISSUE_TYPES.includes(row.type)) {
      throw new EntityError(`Issue.type '${row.type}' is not a valid issue type`, ENTITY, 'type');
    }
    if (!STATUSES.includes(row.status)) {
      throw new EntityError(`Issue.status '${row.status}' is not a valid status`, ENTITY, 'status');
    }
    if (!PRIORITIES.includes(row.priority)) {
      throw new EntityError(
        `Issue.priority '${row.priority}' is not a valid priority`,
        ENTITY,
        'priority'
      );
    }

    this.id = row.id;
    this.workspaceId = row.workspaceId;
    this.projectId = row.projectId;
    this.key = row.key;
    this.seq = row.seq;
    this.type = row.type;
    this.status = row.status;
    this.priority = row.priority;
    this.title = row.title;
    this.description = row.description ?? null;
    this.labels = Array.isArray(row.labels) ? row.labels : [];
    this.assigneeUserId = row.assigneeUserId ?? null;
    this.reporterUserId = row.reporterUserId ?? null;
    this.parentIssueId = row.parentIssueId ?? null;
    this.startDate = formatDate(row.startDate);
    this.endDate = formatDate(row.endDate);
    // estimate may come back as string from pg in some configs;
    // coerce defensively.
    this.estimate =
      row.estimate === null || row.estimate === undefined
        ? null
        : typeof row.estimate === 'number'
          ? row.estimate
          : Number(row.estimate);
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: IssueRow): Issue {
    return new Issue(row);
  }
}

/**
 * Format a `date`-typed pg column as `YYYY-MM-DD`. Knex returns these
 * as `Date` objects under most configurations; we strip the time part
 * and return a date-only ISO string.
 */
function formatDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // Already a string. If it includes a 'T' it's an ISO datetime — slice
  // to the date portion. Otherwise it's already YYYY-MM-DD.
  return value.length >= 10 ? value.slice(0, 10) : value;
}
