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
