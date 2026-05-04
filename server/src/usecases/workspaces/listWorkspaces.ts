import * as workspaceService from '../../services/workspaceService.js';
import * as membershipService from '../../services/membershipService.js';
import type { Workspace } from '../../entities/Workspace.js';
import type { Role } from '../../lib/constants.js';

export interface WorkspaceListItem {
  workspace: Workspace;
  /** The user's effective role in this workspace (admin / write / read). */
  role: Role;
}

/**
 * Workspaces under a tenant that the user can access. Tenant admins see
 * every workspace; non-admins see only workspaces where they have an
 * explicit `workspace_memberships` row.
 */
export async function listWorkspaces(
  userId: string,
  tenantId: string,
  tenantRole: Role
): Promise<WorkspaceListItem[]> {
  const workspaces = await workspaceService.listByTenant(tenantId);
  const out: WorkspaceListItem[] = [];
  for (const w of workspaces) {
    if (tenantRole === 'admin') {
      out.push({ workspace: w, role: 'admin' });
      continue;
    }
    const wm = await membershipService.getWorkspaceMembership(userId, w.id);
    if (wm) out.push({ workspace: w, role: wm.role });
  }
  return out;
}
