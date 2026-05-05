/**
 * S3FileStore — deferred stub.
 *
 * The S3 driver is intentionally not implemented for v1.  All four methods
 * throw AppError 501 so any accidental misconfiguration (FILESTORE_DRIVER=s3
 * in dev) fails loudly rather than silently.
 *
 * To implement: install the AWS SDK (requires explicit user approval per
 * v1-constraints.md), read credentials from env vars, and replace each
 * throw with real SDK calls.  The interface contract (put/get/getReadUrl/
 * delete) is defined in types.ts.
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
