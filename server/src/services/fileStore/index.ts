import type { FileStore } from './types.js';
import { PgFileStore } from './pgFileStore.js';
import { S3FileStore } from './s3FileStore.js';

export type { FileStore, PutInput, PutResult, ReadUrlInput } from './types.js';

let _store: FileStore | null = null;

/**
 * Returns the FileStore singleton, creating it on first call.
 * Driver is selected via the FILESTORE_DRIVER env var (default: 'pg').
 *
 * Supported values:
 *   'pg'  — stores bytes in Postgres file_blobs table (dev / no-S3 setups)
 *   's3'  — stub that throws 501; replace with real AWS SDK impl when ready
 */
export function getFileStore(): FileStore {
  if (_store) return _store;

  const driver = process.env.FILESTORE_DRIVER ?? 'pg';
  switch (driver) {
    case 'pg':
      _store = new PgFileStore();
      break;
    case 's3':
      _store = new S3FileStore();
      break;
    default:
      throw new Error(
        `Unknown FILESTORE_DRIVER '${driver}'. Supported values: 'pg', 's3'.`
      );
  }
  return _store;
}

/**
 * Reset the singleton — used in tests that need to reinitialise the store
 * after changing FILESTORE_DRIVER.  Not needed in normal app usage.
 */
export function _resetFileStore(): void {
  _store = null;
}
