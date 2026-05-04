import { AppError } from '../../lib/errors.js';
import * as workspaceService from '../../services/workspaceService.js';
import type { Workspace } from '../../entities/Workspace.js';
import type { WorkspaceStatus } from '../../lib/constants.js';

/**
 * Flip a workspace's status. Archive freezes the workspace (project mutations
 * blocked by `requireActiveWorkspace`); unarchive restores it. No data is
 * destroyed in either direction. Idempotent — flipping to the current
 * status is a no-op that still returns the workspace.
 */
export async function setWorkspaceStatus(
  workspaceId: string,
  status: WorkspaceStatus
): Promise<Workspace> {
  const updated = await workspaceService.setStatus(workspaceId, status);
  if (!updated) throw new AppError('Workspace not found', 404);
  return updated;
}
