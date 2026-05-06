import * as membershipService from '../../services/membershipService.js';
import type { WorkspaceMemberView } from '../../services/membershipService.js';

export async function listWorkspaceMembers(input: {
  workspaceId: string;
  tenantId: string;
}): Promise<WorkspaceMemberView[]> {
  return membershipService.listWorkspaceMembers(input.workspaceId, input.tenantId);
}
