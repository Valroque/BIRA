import { AppError } from '../../lib/errors.js';
import { getFileStore } from '../../services/fileStore/index.js';
import * as fileService from '../../services/fileService.js';
import type { File } from '../../entities/File.js';

export interface FileDownload {
  file: File;
  bytes: Buffer;
}

/**
 * Looks up a file by workspace + id and fetches its raw bytes from the
 * FileStore.  Throws AppError 404 if the file doesn't exist in the given
 * workspace (cross-workspace isolation) or if the blob row is missing.
 */
export async function getFileForDownload(
  workspaceId: string,
  fileId: string
): Promise<FileDownload> {
  const file = await fileService.findByWorkspaceAndId(workspaceId, fileId);
  if (!file) {
    throw new AppError('File not found', 404);
  }

  const store = getFileStore();
  const bytes = await store.get(file.storageKey);

  return { file, bytes };
}
