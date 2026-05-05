import path from 'node:path';
import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import { getFileStore } from '../../services/fileStore/index.js';
import * as fileService from '../../services/fileService.js';
import type { File } from '../../entities/File.js';

export interface UploadFileInput {
  tenantId: string;
  workspaceId: string;
  uploaderUserId: string;
  mime: string;
  filename: string;
  bytes: Buffer;
}

/**
 * Validates, stores, and records a file upload in a single transaction.
 *
 * Validation (400 on failure):
 *   - mime: non-empty, max 255 chars
 *   - filename: non-empty after basename extraction, max 500 chars,
 *     must not contain '/' or '\' after normalization
 *   - bytes: non-empty (defense-in-depth; multer also caps at 10 MB)
 *
 * The blob is written to the FileStore and the metadata to the files table
 * inside the same Knex transaction so a partial failure never leaves an
 * orphaned blob or a metadata row with no backing bytes.
 */
export async function uploadFile(input: UploadFileInput): Promise<File> {
  // ── validation ───────────────────────────────────────────────────────────

  if (!input.mime || input.mime.trim().length === 0) {
    throw new AppError('mime must be non-empty', 400);
  }
  if (input.mime.length > 255) {
    throw new AppError('mime must be 255 characters or fewer', 400);
  }

  if (!input.filename || input.filename.trim().length === 0) {
    throw new AppError('filename must be non-empty', 400);
  }
  // Strip any path component — only keep the base name.
  const safeFilename = path.basename(input.filename);
  if (!safeFilename || safeFilename.trim().length === 0) {
    throw new AppError('filename must not be empty after stripping path components', 400);
  }
  if (safeFilename.includes('/') || safeFilename.includes('\\')) {
    throw new AppError('filename must not contain path separators', 400);
  }
  if (safeFilename.length > 500) {
    throw new AppError('filename must be 500 characters or fewer', 400);
  }

  if (!Buffer.isBuffer(input.bytes) || input.bytes.length === 0) {
    throw new AppError('File must not be empty', 400);
  }

  // ── transaction: put blob → write metadata ────────────────────────────

  const store = getFileStore();

  return db.transaction(async (trx) => {
    const putResult = await store.put(
      {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        bytes: input.bytes,
      },
      trx
    );

    const file = await fileService.create(
      {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        uploaderUserId: input.uploaderUserId,
        mime: input.mime,
        size: putResult.size,
        sha256: putResult.sha256,
        filename: safeFilename,
        storageKey: putResult.storageKey,
      },
      trx
    );

    return file;
  });
}
