import { createHash, randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import { signFileId } from '../../lib/fileSignature.js';
import type { FileStore, PutInput, PutResult, ReadUrlInput } from './types.js';

interface BlobRow {
  bytes: Buffer;
}

/**
 * Public origin used to build absolute read URLs. Stripped of any trailing
 * slash so callers can `${base}/api/...` without doubling slashes.
 *
 * Resolution order:
 *   1. `PUBLIC_API_URL` env var (e.g. `https://api.example.com`)
 *   2. `http://localhost:<PORT>` — dev fallback so a fresh clone Just Works.
 */
function getPublicApiBase(): string {
  const fromEnv = process.env.PUBLIC_API_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/+$/, '');
  const port = process.env.PORT ?? '5001';
  return `http://localhost:${port}`;
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
   * Returns a signed, time-limited, **absolute** read URL for the given file.
   *
   * Absolute (not relative) so `<img src>` works regardless of where the FE
   * is served from — the BE and FE typically live on different origins
   * (e.g. localhost:5001 vs localhost:5173 in dev). S3 presigned URLs are
   * also absolute, so this matches the S3 driver's eventual behaviour.
   *
   * The URL points at the public file route (`server/src/routes/publicFiles.ts`)
   * which sits outside the authenticated `/api/tenants` chain, so plain
   * `<img src>` requests that can't carry a Bearer token still work. The
   * `sig` query param is an HMAC over `<fileId>.<exp>` — see
   * `server/src/lib/fileSignature.ts` for the verification path.
   *
   * The base URL is taken from `PUBLIC_API_URL` (e.g. `https://api.example.com`)
   * with a `http://localhost:<PORT>` dev fallback. `tenantSlug` /
   * `workspaceSlug` are part of the `ReadUrlInput` contract for the S3
   * driver's bucket layout — the PG driver doesn't need them.
   */
  getReadUrl({ id }: ReadUrlInput): string {
    const { sig, exp } = signFileId(id);
    return `${getPublicApiBase()}/api/files/${id}?sig=${sig}&exp=${exp}`;
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
