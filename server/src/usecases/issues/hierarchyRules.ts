import { AppError } from '../../lib/errors.js';
import * as issueService from '../../services/issueService.js';
import type { Issue } from '../../entities/Issue.js';
import { ISSUE_TYPE_NAMES, type IssueType } from '../../lib/constants.js';
import type { Knex } from 'knex';

/**
 * Hierarchy rules — single source of truth shared by `createIssue` and
 * `setIssueParent`. The matrix below comes from
 * `.claude/rules/v1-constraints.md` "Issue hierarchy":
 *
 *   Child → Allowed parent types
 *   E (Epic)  → none (top-level only)
 *   S (Story) → E only (parent is mandatory)
 *   T (Task)  → E or S  (orphan is allowed)
 *   B (Bug)   → E or S  (orphan is allowed)
 *
 *   Task / Bug are always leaves — a Task or Bug parent is invalid for
 *   any child type.
 */

const ALLOWED_PARENT: Record<IssueType, ReadonlySet<IssueType>> = {
  E: new Set<IssueType>(),
  S: new Set<IssueType>(['E']),
  T: new Set<IssueType>(['E', 'S']),
  B: new Set<IssueType>(['E', 'S']),
};

export function parentIsRequired(childType: IssueType): boolean {
  return childType === 'S';
}

export function canHaveAnyParent(childType: IssueType): boolean {
  return ALLOWED_PARENT[childType].size > 0;
}

/**
 * Validate a proposed parent for a child issue. Throws AppError(400)
 * with FE-friendly messages on any rule violation. Returns the parent
 * issue on success.
 *
 *   - Parent must exist within `workspaceId` AND `projectId`.
 *   - Parent type must be in the allowed set for child type.
 *   - Self-parent and cycles are rejected.
 *
 * Pass an existing trx so the read sees uncommitted writes from the
 * same transaction (needed when `createIssue` allocates inside a trx).
 */
export async function validateParentAssignment(args: {
  childIssueId: string | null; // null when called from createIssue (no row yet)
  childType: IssueType;
  parentIssueId: string;
  workspaceId: string;
  projectId: string;
  trx?: Knex.Transaction;
}): Promise<Issue> {
  const { childIssueId, childType, parentIssueId, workspaceId, projectId, trx } = args;

  if (!ALLOWED_PARENT[childType].size) {
    // Epic: no valid parent at all.
    throw new AppError(`${ISSUE_TYPE_NAMES[childType]}s cannot have a parent`, 400);
  }

  if (childIssueId !== null && childIssueId === parentIssueId) {
    throw new AppError('An issue cannot be its own parent', 400);
  }

  const parent = await issueService.getById(parentIssueId, trx);
  if (!parent || parent.workspaceId !== workspaceId) {
    // Cross-workspace (or missing) parent — return 404-ish wording but
    // we throw 400 because the body specifies an unreachable id, not
    // because the URL was wrong.
    throw new AppError('Parent issue not found in this workspace', 400);
  }
  if (parent.projectId !== projectId) {
    throw new AppError('Parent must be in the same project', 400);
  }
  if (!ALLOWED_PARENT[childType].has(parent.type)) {
    throw new AppError(
      `A ${ISSUE_TYPE_NAMES[childType]} cannot have a ${ISSUE_TYPE_NAMES[parent.type]} parent`,
      400
    );
  }

  // Cycle check — walk the chain from the proposed parent upward; if
  // we hit `childIssueId`, the assignment would create a cycle. The
  // type rules above already prevent cycles in any valid tree (Tasks
  // are leaves, Stories must be under Epics, Epics never have a
  // parent), but defence in depth: a hand-crafted DB state could
  // regress this and the check is cheap.
  if (childIssueId !== null) {
    let cursor: string | null = parent.parentIssueId;
    const visited = new Set<string>([parent.id]);
    while (cursor) {
      if (cursor === childIssueId) {
        throw new AppError('Setting this parent would create a cycle', 400);
      }
      if (visited.has(cursor)) {
        // Pre-existing cycle in the DB — bail rather than loop forever.
        throw new AppError('Parent chain contains a cycle (data corrupt)', 500);
      }
      visited.add(cursor);
      const next = await issueService.getById(cursor, trx);
      cursor = next?.parentIssueId ?? null;
    }
  }

  return parent;
}
