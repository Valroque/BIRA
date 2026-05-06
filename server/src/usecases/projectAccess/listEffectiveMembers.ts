import * as projectAccessService from '../../services/projectAccessService.js';
import type { ProjectEffectiveMember } from '../../services/projectAccessService.js';

export interface ListEffectiveMembersInput {
  projectId: string;
  workspaceId: string;
  tenantId: string;
}

export async function listEffectiveMembers(
  input: ListEffectiveMembersInput
): Promise<ProjectEffectiveMember[]> {
  return projectAccessService.computeEffectiveMembers(
    input.projectId,
    input.workspaceId,
    input.tenantId
  );
}
