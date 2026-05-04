import * as issueService from '../../services/issueService.js';
import type { Issue } from '../../entities/Issue.js';
import type { IssueFilters } from '../../services/issueService.js';

export async function listIssuesByProject(
  projectId: string,
  filters: IssueFilters = {}
): Promise<Issue[]> {
  return issueService.listByProject(projectId, filters);
}

export async function listIssuesByWorkspace(
  workspaceId: string,
  filters: IssueFilters = {}
): Promise<Issue[]> {
  return issueService.listByWorkspace(workspaceId, filters);
}
