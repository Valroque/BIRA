import * as issueService from '../../services/issueService.js';
import type { Issue } from '../../entities/Issue.js';

export async function getIssue(workspaceId: string, key: string): Promise<Issue | null> {
  return issueService.findByKey(workspaceId, key);
}
