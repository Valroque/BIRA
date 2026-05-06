import * as projectAccessService from '../../services/projectAccessService.js';
import type { ProjectAccessView } from '../../services/projectAccessService.js';

export async function listProjectAccess(input: {
  projectId: string;
}): Promise<ProjectAccessView> {
  return projectAccessService.listAccess(input.projectId);
}
