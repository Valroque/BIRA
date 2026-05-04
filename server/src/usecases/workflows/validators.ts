import { AppError } from '../../lib/errors.js';
import { STATUSES, type StatusId } from '../../lib/constants.js';
import type { WorkflowNodeInput, WorkflowTransitionInput } from '../../services/workflowService.js';
import type { RuleType } from '../../entities/WorkflowTransitionRule.js';
import { RULE_TYPES, validateRuleParams } from '../../entities/WorkflowTransitionRule.js';

/**
 * Validate the node input set: non-empty, valid status ids, integer
 * coordinates, at most one initial. Mirrors the constraints listed in
 * the slice-3 brief and `.claude/rules/v1-constraints.md`.
 */
export function validateNodes(nodes: WorkflowNodeInput[]): void {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new AppError('Workflow must have at least one node', 400);
  }
  let initialCount = 0;
  const seenStatuses = new Set<StatusId>();
  for (const n of nodes) {
    if (!STATUSES.includes(n.statusId)) {
      throw new AppError(`Invalid status '${n.statusId}' on workflow node`, 400);
    }
    if (seenStatuses.has(n.statusId)) {
      throw new AppError(`Duplicate node for status '${n.statusId}'`, 400);
    }
    seenStatuses.add(n.statusId);
    if (!Number.isInteger(n.x) || !Number.isInteger(n.y)) {
      throw new AppError('Workflow node x / y must be integers', 400);
    }
    if (n.isInitial) initialCount += 1;
  }
  if (initialCount > 1) {
    throw new AppError('Workflow may have at most one initial node', 400);
  }
}

/**
 * Validate the transition input set against the *just-inserted* node id
 * set (so cross-workflow references are caught). Each rule is also
 * validated for shape per its type.
 */
export function validateTransitions(
  transitions: WorkflowTransitionInput[],
  workflowNodeIds: Set<string>
): void {
  for (const t of transitions) {
    if (!workflowNodeIds.has(t.fromNodeId)) {
      throw new AppError(
        `Transition fromNodeId '${t.fromNodeId}' does not belong to this workflow`,
        400
      );
    }
    if (!workflowNodeIds.has(t.toNodeId)) {
      throw new AppError(
        `Transition toNodeId '${t.toNodeId}' does not belong to this workflow`,
        400
      );
    }
    if (t.rules) {
      for (const r of t.rules) {
        if (!RULE_TYPES.includes(r.type as RuleType)) {
          throw new AppError(`Invalid transition rule type '${r.type}'`, 400);
        }
        // validateRuleParams throws an EntityError on a shape mismatch;
        // we want a 400 to the client, not a 500. Catch + rethrow as
        // AppError.
        try {
          validateRuleParams(r.type, r.params);
        } catch (err) {
          if (err instanceof Error) throw new AppError(err.message, 400);
          throw err;
        }
      }
    }
  }
}
