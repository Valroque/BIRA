import * as workflowService from '../../services/workflowService.js';
import * as projectWorkflowService from '../../services/projectWorkflowService.js';
import { roleAtLeast, type Role, type StatusId } from '../../lib/constants.js';
import type { Issue } from '../../entities/Issue.js';

export interface EvaluateTransitionInput {
  issue: Issue;
  toStatus: StatusId;
  actingUserId: string;
  actingUserRole: Role | null | undefined;
}

export interface EvaluateTransitionResult {
  allowed: boolean;
  reason?: string;
  /**
   * True when the issue's project has no workflow (explicit or default
   * fallback) for its type. The caller (updateIssue) treats this as a
   * permissive bypass — see slice 5 brief. Logged but not blocked.
   */
  noWorkflow?: boolean;
}

/**
 * The five-rule guard from `.claude/rules/v1-constraints.md`.
 *
 * Pure-ish: the only IO is the workflow lookup. Evaluation itself is a
 * synchronous walk over the issue + transition rules.
 */
export async function evaluateTransition(
  input: EvaluateTransitionInput
): Promise<EvaluateTransitionResult> {
  const { issue, toStatus, actingUserId, actingUserRole } = input;

  // Same-status no-op — never run the guard for a status that isn't
  // actually moving.
  if (toStatus === issue.status) {
    return { allowed: true };
  }

  // Resolve workflow for (project, issue.type). Two layers:
  //   1. explicit project_workflows row
  //   2. workspace-level workflow with the per-type default slug
  //      (mirrors DEFAULT_PROJECT_WORKFLOWS from the FE)
  const explicit = await projectWorkflowService.findByPair(issue.projectId, issue.type);
  let workflowId: string | null = explicit?.workflowId ?? null;

  if (!workflowId) {
    const defaultSlug = issue.type === 'E' ? 'epic-coarse' : 'default';
    const fallback = await workflowService.findBySlug(issue.workspaceId, defaultSlug);
    workflowId = fallback?.id ?? null;
  }

  if (!workflowId) {
    // No workflow in the system at all for this combo — fall through to
    // permissive behaviour (slice 1 / 2 default). Caller logs.
    return { allowed: true, noWorkflow: true };
  }

  const [nodes, transitions] = await Promise.all([
    workflowService.listNodesByWorkflow(workflowId),
    workflowService.listTransitionsByWorkflow(workflowId),
  ]);

  const fromNode = nodes.find((n) => n.statusId === issue.status);
  const toNode = nodes.find((n) => n.statusId === toStatus);

  if (!fromNode) {
    // The issue's current status isn't part of this workflow — treat as
    // no-workflow rather than hard-fail. The seeder / migration window
    // could leave issues with a status the workflow doesn't model.
    return { allowed: true, noWorkflow: true };
  }
  if (!toNode) {
    return {
      allowed: false,
      reason: `Status '${toStatus}' is not a node in this workflow`,
    };
  }

  const transition = transitions.find(
    (t) => t.fromNodeId === fromNode.id && t.toNodeId === toNode.id
  );
  if (!transition) {
    return {
      allowed: false,
      reason: `No transition from '${issue.status}' to '${toStatus}' in this workflow`,
    };
  }

  const rules = await workflowService.listRulesByTransitions([transition.id]);
  const transitionRules = rules.get(transition.id) ?? [];

  for (const rule of transitionRules) {
    switch (rule.type) {
      case 'role': {
        const required = (rule.params as { role: Role }).role;
        if (!roleAtLeast(actingUserRole, required)) {
          return {
            allowed: false,
            reason: `Transition requires role '${required}' or higher`,
          };
        }
        break;
      }
      case 'assignee_only': {
        if (issue.assigneeUserId !== actingUserId) {
          return {
            allowed: false,
            reason: 'Only the assignee can make this transition',
          };
        }
        break;
      }
      case 'reporter_only': {
        if (issue.reporterUserId !== actingUserId) {
          return {
            allowed: false,
            reason: 'Only the reporter can make this transition',
          };
        }
        break;
      }
      case 'not_self': {
        if (issue.reporterUserId === actingUserId) {
          return {
            allowed: false,
            reason: 'The reporter cannot make this transition',
          };
        }
        break;
      }
      case 'required_fields': {
        const fields = (rule.params as { fields: string[] }).fields;
        for (const field of fields) {
          if (!isFieldSet(issue, field)) {
            return {
              allowed: false,
              reason: `Field '${field}' must be set before this transition`,
            };
          }
        }
        break;
      }
      default: {
        // Unknown rule type — fail closed.
        return {
          allowed: false,
          reason: `Unknown transition rule type`,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Return true if `field` is "set" on the issue. Defensive about
 * unknown field names — fail closed (treat as not-set) so a typo
 * doesn't silently pass the guard.
 */
function isFieldSet(issue: Issue, field: string): boolean {
  switch (field) {
    case 'assignee':
      return issue.assigneeUserId !== null;
    case 'estimate': {
      const v = (issue as unknown as { estimate?: number | null }).estimate;
      return typeof v === 'number' && v > 0;
    }
    case 'description':
      return typeof issue.description === 'string' && issue.description.trim().length > 0;
    case 'startDate': {
      const v = (issue as unknown as { startDate?: string | null }).startDate;
      return typeof v === 'string' && v.length > 0;
    }
    case 'endDate': {
      const v = (issue as unknown as { endDate?: string | null }).endDate;
      return typeof v === 'string' && v.length > 0;
    }
    default:
      // Unknown field names fail closed.
      return false;
  }
}
