import type { Knex } from 'knex';
import { db } from '../db/knex.js';
import { File, type FileRow } from '../entities/File.js';

const COLUMNS = [
  'id',
  'tenant_id',
  'workspace_id',
  'uploader_user_id',
  'mime',
  'size',
  'sha256',
  'filename',
  'storage_key',
  'created_at',
  'updated_at',
] as const;

type Q = Knex | Knex.Transaction;

export interface CreateFileInput {
  tenantId: string;
  workspaceId: string;
  uploaderUserId: string | null;
  mime: string;
  size: number;
  sha256: string;
  filename: string;
  storageKey: string;
}

export async function create(input: CreateFileInput, trx?: Q): Promise<File> {
  const [row] = (await (trx ?? db)('files')
    .insert({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      uploaderUserId: input.uploaderUserId,
      mime: input.mime,
      size: input.size,
      sha256: input.sha256,
      filename: input.filename,
      storageKey: input.storageKey,
    })
    .returning(COLUMNS)) as FileRow[];
  return File.fromRow(row);
}

export async function getById(id: string, trx?: Q): Promise<File | null> {
  const row = (await (trx ?? db)('files')
    .where('id', id)
    .select(COLUMNS)
    .first()) as FileRow | undefined;
  return row ? File.fromRow(row) : null;
}

export async function findByWorkspaceAndId(
  workspaceId: string,
  id: string,
  trx?: Q
): Promise<File | null> {
  const row = (await (trx ?? db)('files')
    .where('workspace_id', workspaceId)
    .where('id', id)
    .select(COLUMNS)
    .first()) as FileRow | undefined;
  return row ? File.fromRow(row) : null;
}

/**
 * Batch-fetch files by ids, scoped to the given workspace.
 * Silently drops any ids that don't exist or belong to a different workspace.
 * Used by slices B/C to hydrate file attachments on issues/comments.
 */
export async function findByIdsInWorkspace(
  workspaceId: string,
  ids: string[],
  trx?: Q
): Promise<Map<string, File>> {
  if (ids.length === 0) return new Map();
  const rows = (await (trx ?? db)('files')
    .where('workspace_id', workspaceId)
    .whereIn('id', ids)
    .select(COLUMNS)) as FileRow[];
  return new Map(rows.map((r) => [r.id, File.fromRow(r)]));
}

export async function deleteById(id: string, trx?: Q): Promise<void> {
  await (trx ?? db)('files').where('id', id).delete();
}
