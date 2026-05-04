/**
 * Role ladder, shared by tenant and workspace membership.
 *
 * Ordered: read < write < admin. Higher implies lower (write implies read,
 * admin implies write). This matches the FE's `Role` type from
 * `web/src/fixtures.ts`.
 */
export const ROLES = ['admin', 'write', 'read'] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { read: 0, write: 1, admin: 2 };

export function roleAtLeast(role: Role | null | undefined, required: Role): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[required];
}

export const TENANT_MEMBERSHIP_STATUSES = ['active', 'invited', 'deactivated'] as const;
export type TenantMembershipStatus = (typeof TENANT_MEMBERSHIP_STATUSES)[number];

export const PROJECT_STATUSES = ['active', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const WORKSPACE_STATUSES = ['active', 'archived'] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export const TENANT_STATUSES = ['active', 'deactivated'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/**
 * Issue type letters. Hardcoded for v1 — no per-workspace customisation.
 * Mirror of `IssueTypeLetter` in `web/src/fixtures.ts`.
 *   T = Task, B = Bug, S = Story, E = Epic
 */
export const ISSUE_TYPES = ['T', 'B', 'S', 'E'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_TYPE_NAMES: Record<IssueType, string> = {
  T: 'Task',
  B: 'Bug',
  S: 'Story',
  E: 'Epic',
};

/**
 * Closed status enum shared between issues and workflow nodes. Mirror of
 * `STATUSES` in `web/src/components/shell.tsx`. Workflows govern *which
 * transitions* between statuses are legal — not the universe of statuses
 * itself, which is fixed for v1.
 */
export const STATUSES = [
  'backlog',
  'todo',
  'in-progress',
  'in-review',
  'done',
  'canceled',
] as const;
export type StatusId = (typeof STATUSES)[number];

export const STATUS_NAMES: Record<StatusId, string> = {
  'backlog': 'Backlog',
  'todo': 'Todo',
  'in-progress': 'In Progress',
  'in-review': 'In Review',
  'done': 'Done',
  'canceled': 'Canceled',
};

/**
 * Priority levels. Mirror of `Issue.priority` in `web/src/fixtures.ts`.
 * Ordered from highest urgency to "no priority set". Stored as the
 * lowercase string, not a numeric index.
 */
export const PRIORITIES = ['urgent', 'high', 'med', 'low', 'none'] as const;
export type Priority = (typeof PRIORITIES)[number];
