import { AppError } from '../../lib/errors.js';
import * as issueService from '../../services/issueService.js';
import * as issueLinksService from '../../services/issueLinksService.js';

export interface UnrelateIssuesInput {
  workspaceId: string;
  aKey: string;
  bKey: string;
}

export async function unrelateIssues(input: UnrelateIssuesInput): Promise<void> {
  const [a, b] = await Promise.all([
    issueService.findByKey(input.workspaceId, input.aKey),
    issueService.findByKey(input.workspaceId, input.bKey),
  ]);
  if (!a) throw new AppError(`Issue '${input.aKey}' not found`, 404);
  if (!b) throw new AppError(`Issue '${input.bKey}' not found`, 404);
  const removed = await issueLinksService.removeRelation(a.id, b.id);
  if (!removed) {
    throw new AppError('No relation exists between these issues', 404);
  }
}
