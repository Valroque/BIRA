import { AppError } from '../../lib/errors.js';
import { getFileStore } from '../../services/fileStore/index.js';
import * as fileService from '../../services/fileService.js';
import type { File } from '../../entities/File.js';

export interface FileDownload {
  file: File;
  bytes: Buffer;
}

/**
 * Workspace-scope-less file lookup, used by the public signed-URL route.
 *
 * Authorisation comes from the URL signature (verified by the route before
 * this is called) — the signature is bound to the file id, so a holder of
 * a valid signature is by definition allowed to read this specific file.
 * That makes the workspace_id check in `findByWorkspaceAndId` redundant:
 * if you can sign a URL for a file, you can read it.
 */
export async function getFileBySignedId(fileId: string): Promise<FileDownload> {
  const file = await fileService.getById(fileId);
  if (!file) throw new AppError('File not found', 404);
  const bytes = await getFileStore().get(file.storageKey);
  return { file, bytes };
}
