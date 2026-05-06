/**
 * S3FileStore — deferred stub.
 *
 * The S3 driver is intentionally not implemented for v1.  All four methods
 * throw AppError 501 so any accidental misconfiguration (FILESTORE_DRIVER=s3
 * in dev) fails loudly rather than silently.
 *
 * To implement:
 *   1. Install the AWS SDK (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`).
 *      Requires explicit user approval per v1-constraints.md.
 *   2. Read credentials + bucket name from env vars in the constructor.
 *   3. `put` → `PutObjectCommand`. Use `tenantId` / `workspaceId` in the
 *      object key prefix (e.g. `t/<tenantId>/w/<workspaceId>/<storageKey>`)
 *      so cross-tenant isolation is enforced at the bucket layer too.
 *   4. `get` → `GetObjectCommand` + stream collection.
 *   5. `getReadUrl` → `getSignedUrl(s3, GetObjectCommand, { expiresIn: 3600 })`.
 *      The interface returns `string` synchronously, so cache the presigned
 *      URL on the file row at upload time (or per-process for short TTL)
 *      rather than awaiting on every render — `getSignedUrl` itself is async.
 *   6. `delete` → `DeleteObjectCommand`.
 *
 * The PG-driver-specific `lib/fileSignature.ts` HMAC path is not used here:
 * S3 presigned URLs point directly at the bucket and bypass the public
 * file route entirely.
 *
 * The interface contract (put/get/getReadUrl/delete) is defined in types.ts.
 */
import type { Knex } from 'knex';
import { AppError } from '../../lib/errors.js';
import type { FileStore, PutInput, PutResult, ReadUrlInput } from './types.js';

export class S3FileStore implements FileStore {
  async put(_input: PutInput, _trx?: Knex.Transaction): Promise<PutResult> {
    throw new AppError('S3 driver not implemented', 501);
  }

  async get(_storageKey: string): Promise<Buffer> {
    throw new AppError('S3 driver not implemented', 501);
  }

  getReadUrl(_file: ReadUrlInput): string {
    throw new AppError('S3 driver not implemented', 501);
  }

  async delete(_storageKey: string, _trx?: Knex.Transaction): Promise<void> {
    throw new AppError('S3 driver not implemented', 501);
  }
}
