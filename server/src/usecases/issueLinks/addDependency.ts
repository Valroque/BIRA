import { AppError } from '../../lib/errors.js';
import * as issueService from '../../services/issueService.js';
import * as issueLinksService from '../../services/issueLinksService.js';

export interface AddDependencyInput {
  workspaceId: string;
  blockerKey: string;
  dependentKey: string;
}

/**
 * "depends on" — directed Task→Task. The dependent waits for the
 * blocker. Both ends must be Tasks; cross-project is allowed (per
 * the user's earlier scoping decision).
 */
export async function addDependency(input: AddDependencyInput): Promise<void> {
  if (input.blockerKey === input.dependentKey) {
    throw new AppError('An issue cannot depend on itself', 400);
  }

  const [blocker, dependent] = await Promise.all([
    issueService.findByKey(input.workspaceId, input.blockerKey),
    issueService.findByKey(input.workspaceId, input.dependentKey),
  ]);
  if (!blocker) throw new AppError(`Issue '${input.blockerKey}' not found`, 404);
  if (!dependent) throw new AppError(`Issue '${input.dependentKey}' not found`, 404);

  if (blocker.type !== 'T' || dependent.type !== 'T') {
    throw new AppError('Depends-on links are Task-only', 400);
  }

  const cycle = await issueLinksService.wouldCreateCycle(blocker.id, dependent.id);
  if (cycle) {
    throw new AppError('Adding this dependency would create a cycle', 400);
  }

  await issueLinksService.addDependency(blocker.id, dependent.id);
}
