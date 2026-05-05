import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import { getFileStore } from '../../services/fileStore/index.js';
import * as fileService from '../../services/fileService.js';

export interface DeleteFileInput {
  workspaceId: string;
  fileId: string;
  actingUserId: string;
  actingRole: string;
}

/**
 * Authorises and hard-deletes a file.
 *
 * Authorization: the acting user must either be the original uploader OR
 * have the 'admin' role in the workspace.
 *
 * Both the file_blobs row (via FileStore.delete) and the files row (via
 * fileService.deleteById) are removed inside the same transaction.
 * There is no soft-delete path.
 */
export async function deleteFile(input: DeleteFileInput): Promise<void> {
  const file = await fileService.findByWorkspaceAndId(input.workspaceId, input.fileId);
  if (!file) {
    throw new AppError('File not found', 404);
  }

  const isUploader = file.uploaderUserId === input.actingUserId;
  const isAdmin = input.actingRole === 'admin';
  if (!isUploader && !isAdmin) {
    throw new AppError('Not authorized to delete this file', 403);
  }

  const store = getFileStore();
  await db.transaction(async (trx) => {
    await store.delete(file.storageKey, trx);
    await fileService.deleteById(file.id, trx);
  });
}
