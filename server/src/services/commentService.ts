import type { Knex } from 'knex';
import { db } from '../db/knex.js';
import { Comment, type CommentRow } from '../entities/Comment.js';

const COLUMNS = [
  'id',
  'tenant_id',
  'workspace_id',
  'issue_id',
  'author_user_id',
  'body',
  'attachment_ids',
  'mentions',
  'created_at',
  'updated_at',
] as const;

type Q = Knex | Knex.Transaction;

export interface CreateCommentInput {
  tenantId: string;
  workspaceId: string;
  issueId: string;
  authorUserId: string | null;
  body: string;
  attachmentIds?: string[];
  mentions?: Array<{ type: string; id: string }>;
}

export async function create(input: CreateCommentInput, trx?: Q): Promise<Comment> {
  const [row] = (await (trx ?? db)('comments')
    .insert({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      issueId: input.issueId,
      authorUserId: input.authorUserId,
      body: input.body,
      attachmentIds: input.attachmentIds ?? [],
      mentions: JSON.stringify(input.mentions ?? []),
    })
    .returning(COLUMNS)) as CommentRow[];
  return Comment.fromRow(row);
}

export async function listByIssue(issueId: string, trx?: Q): Promise<Comment[]> {
  const rows = (await (trx ?? db)('comments')
    .where('issue_id', issueId)
    .select(COLUMNS)
    .orderBy('created_at', 'asc')) as CommentRow[];
  return rows.map(Comment.fromRow);
}

export async function getById(id: string, trx?: Q): Promise<Comment | null> {
  const row = (await (trx ?? db)('comments')
    .where('id', id)
    .select(COLUMNS)
    .first()) as CommentRow | undefined;
  return row ? Comment.fromRow(row) : null;
}

/**
 * Fetch a comment only if it belongs to the given workspace.
 * Returns null when the id doesn't exist OR belongs to a different workspace.
 */
export async function findByWorkspaceAndId(
  workspaceId: string,
  id: string,
  trx?: Q
): Promise<Comment | null> {
  const row = (await (trx ?? db)('comments')
    .where('workspace_id', workspaceId)
    .where('id', id)
    .select(COLUMNS)
    .first()) as CommentRow | undefined;
  return row ? Comment.fromRow(row) : null;
}

export interface UpdateCommentInput {
  body?: string;
  attachmentIds?: string[];
  mentions?: Array<{ type: string; id: string }>;
}

export async function update(
  id: string,
  patch: UpdateCommentInput,
  trx?: Q
): Promise<Comment> {
  if (Object.keys(patch).length === 0) {
    const existing = await getById(id, trx);
    if (!existing) throw new Error(`Comment ${id} not found`);
    return existing;
  }
  const { mentions, ...rest } = patch;
  const updateData: Record<string, unknown> = { ...rest, updatedAt: (trx ?? db).fn.now() };
  if (mentions !== undefined) {
    updateData.mentions = JSON.stringify(mentions);
  }
  const [row] = (await (trx ?? db)('comments')
    .where('id', id)
    .update(updateData)
    .returning(COLUMNS)) as CommentRow[];
  return Comment.fromRow(row);
}

export async function deleteById(id: string, trx?: Q): Promise<void> {
  await (trx ?? db)('comments').where('id', id).delete();
}
