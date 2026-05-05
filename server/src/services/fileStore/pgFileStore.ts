import { createHash, randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import type { FileStore, PutInput, PutResult, ReadUrlInput } from './types.js';

interface BlobRow {
  bytes: Buffer;
}

export class PgFileStore implements FileStore {
  /**
   * Stores the raw bytes in file_blobs, returning the storage key (a new
   * UUID), the SHA-256 hex digest, and the byte count.
   *
   * The storage_key is deliberately separate from files.id so the blob row
   * and the metadata row can be written order-independently inside the same
   * transaction (see migration comment for full rationale).
   */
  async put(input: PutInput, trx?: Knex.Transaction): Promise<PutResult> {
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    const size = input.bytes.length;
    const storageKey = randomUUID();

    await (trx ?? db)('file_blobs').insert({
      fileId: storageKey,
      bytes: input.bytes,
    });

    return { storageKey, sha256, size };
  }

  /**
   * Retrieves raw bytes for the given storage key.
   * Throws AppError 404 if the row doesn't exist.
   */
  async get(storageKey: string): Promise<Buffer> {
    const row = (await db('file_blobs')
      .where('file_id', storageKey)
      .select('bytes')
      .first()) as BlobRow | undefined;

    if (!row) {
      throw new AppError('File bytes not found', 404);
    }
    return row.bytes;
  }

  /**
   * Returns the public download URL for the given file.
   * For the PG driver this is an internal API path; the route handler
   * streams the bytes back from the database.
   */
  getReadUrl({ id, tenantSlug, workspaceSlug }: ReadUrlInput): string {
    return `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/files/${id}`;
  }

  /**
   * Deletes the blob row for the given storage key.
   * Called inside the same transaction as fileService.deleteById so both
   * sides are removed atomically.
   */
  async delete(storageKey: string, trx?: Knex.Transaction): Promise<void> {
    await (trx ?? db)('file_blobs').where('file_id', storageKey).delete();
  }
}
