import { required, toISO } from './utils.js';
import { EntityError } from '../lib/errors.js';

const ENTITY = 'Comment';

export interface CommentRow {
  id: string;
  tenantId: string;
  workspaceId: string;
  issueId: string;
  authorUserId: string | null;
  body: string;
  // text[] — each element is an `attachment:<uuid>` ref.
  attachmentIds: string[];
  // jsonb[] — @[type:uuid] tokens extracted from body on every write.
  mentions: Array<{ type: string; id: string }>;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

export class Comment {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly issueId: string;
  readonly authorUserId: string | null;
  readonly body: string;
  readonly attachmentIds: string[];
  readonly mentions: Array<{ type: string; id: string }>;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: CommentRow) {
    required(row.id, ENTITY, 'id');
    required(row.tenantId, ENTITY, 'tenantId');
    required(row.workspaceId, ENTITY, 'workspaceId');
    required(row.issueId, ENTITY, 'issueId');
    required(row.createdAt, ENTITY, 'createdAt');

    if (!row.body || row.body.length === 0) {
      throw new EntityError(`${ENTITY}.body must be non-empty`, ENTITY, 'body');
    }

    this.id = row.id;
    this.tenantId = row.tenantId;
    this.workspaceId = row.workspaceId;
    this.issueId = row.issueId;
    this.authorUserId = row.authorUserId ?? null;
    this.body = row.body;
    // Default to [] when the column comes back null/missing (shouldn't
    // happen in practice since the column has a DEFAULT '{}' but
    // mirrors how Issue handles labels).
    this.attachmentIds = Array.isArray(row.attachmentIds) ? row.attachmentIds : [];
    this.mentions = Array.isArray(row.mentions) ? row.mentions : [];
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: CommentRow): Comment {
    return new Comment(row);
  }
}
