import { AppError } from '../../lib/errors.js';
import * as issueService from '../../services/issueService.js';
import * as issueLinksService from '../../services/issueLinksService.js';

export interface RelateIssuesInput {
  workspaceId: string;
  aKey: string;
  bKey: string;
}

/**
 * Symmetric "relates" link. No type restriction. Idempotent — relating
 * an existing pair is a no-op.
 */
export async function relateIssues(input: RelateIssuesInput): Promise<void> {
  if (input.aKey === input.bKey) {
    throw new AppError('An issue cannot relate to itself', 400);
  }
  const [a, b] = await Promise.all([
    issueService.findByKey(input.workspaceId, input.aKey),
    issueService.findByKey(input.workspaceId, input.bKey),
  ]);
  if (!a) throw new AppError(`Issue '${input.aKey}' not found`, 404);
  if (!b) throw new AppError(`Issue '${input.bKey}' not found`, 404);
  await issueLinksService.addRelation(a.id, b.id);
}
