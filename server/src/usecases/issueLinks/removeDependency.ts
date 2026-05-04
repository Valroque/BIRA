import { AppError } from '../../lib/errors.js';
import * as issueService from '../../services/issueService.js';
import * as issueLinksService from '../../services/issueLinksService.js';

export interface RemoveDependencyInput {
  workspaceId: string;
  blockerKey: string;
  dependentKey: string;
}

export async function removeDependency(input: RemoveDependencyInput): Promise<void> {
  const [blocker, dependent] = await Promise.all([
    issueService.findByKey(input.workspaceId, input.blockerKey),
    issueService.findByKey(input.workspaceId, input.dependentKey),
  ]);
  if (!blocker) throw new AppError(`Issue '${input.blockerKey}' not found`, 404);
  if (!dependent) throw new AppError(`Issue '${input.dependentKey}' not found`, 404);

  const removed = await issueLinksService.removeDependency(blocker.id, dependent.id);
  if (!removed) {
    throw new AppError('No such dependency exists', 404);
  }
}
