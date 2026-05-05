import * as fileService from '../services/fileService.js';
import { AppError } from './errors.js';
import { parseAttachmentRef, extractFileIds } from './attachmentRefs.js';

/**
 * Validate that every `attachment:<uuid>` ref in `refs` is:
 *   1. Correctly formatted (prefix + uuid).
 *   2. Resolvable to a file that exists in `workspaceId`.
 *
 * Throws AppError 400 on the first violation.
 * Empty refs array is a no-op (valid).
 *
 * NOTE: Dangling refs on *read* are silently filtered (see toCommentView).
 * This validation is write-path only — it prevents creating comments that
 * reference files the caller doesn't own.
 */
export async function validateAttachmentRefs(
  workspaceId: string,
  refs: string[]
): Promise<void> {
  if (refs.length === 0) return;

  // Phase 1: format validation — fail immediately on malformed refs so the
  // error message names the bad ref rather than just "not found".
  for (const ref of refs) {
    if (parseAttachmentRef(ref) === null) {
      throw new AppError(`Invalid attachment ref format: ${ref}`, 400);
    }
  }

  // Phase 2: existence + workspace-scope check.
  const fileIds = extractFileIds(refs);
  const found = await fileService.findByIdsInWorkspace(workspaceId, fileIds);
  if (found.size < fileIds.length) {
    throw new AppError(
      'One or more attachment refs do not exist in this workspace',
      400
    );
  }
}
