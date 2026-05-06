import { required, toISO } from './utils.js';
import { ROLES, TENANT_MEMBERSHIP_STATUSES, type Role, type TenantMembershipStatus } from '../lib/constants.js';
import { EntityError } from '../lib/errors.js';

/**
 * `workspace_memberships` row → entity.
 *
 * `status` reuses the same enum as `tenant_memberships.status`
 * (`active | invited | deactivated`). `'invited'` is reserved for a
 * future invite flow; today we direct-add active rows only — see
 * `addMember.ts`.
 */
export interface WorkspaceMembershipRow {
  id: string;
  userId: string;
  workspaceId: string;
  role: Role;
  status: TenantMembershipStatus;
  lastSeenAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string | null;
}

const ENTITY = 'WorkspaceMembership';

export class WorkspaceMembership {
  readonly id: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly role: Role;
  readonly status: TenantMembershipStatus;
  readonly lastSeenAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;

  constructor(row: WorkspaceMembershipRow) {
    required(row.id, ENTITY, 'id');
    required(row.userId, ENTITY, 'userId');
    required(row.workspaceId, ENTITY, 'workspaceId');
    required(row.role, ENTITY, 'role');
    required(row.status, ENTITY, 'status');
    required(row.createdAt, ENTITY, 'createdAt');

    if (!(ROLES as readonly string[]).includes(row.role)) {
      throw new EntityError(`Unknown workspace role '${row.role}'`, ENTITY, 'role');
    }
    if (!(TENANT_MEMBERSHIP_STATUSES as readonly string[]).includes(row.status)) {
      throw new EntityError(`Unknown workspace membership status '${row.status}'`, ENTITY, 'status');
    }

    this.id = row.id;
    this.userId = row.userId;
    this.workspaceId = row.workspaceId;
    this.role = row.role;
    this.status = row.status;
    this.lastSeenAt = row.lastSeenAt ? toISO(row.lastSeenAt, ENTITY, 'lastSeenAt') : null;
    this.createdAt = toISO(row.createdAt, ENTITY, 'createdAt');
    this.updatedAt = row.updatedAt ? toISO(row.updatedAt, ENTITY, 'updatedAt') : null;
  }

  static fromRow(row: WorkspaceMembershipRow): WorkspaceMembership {
    return new WorkspaceMembership(row);
  }
}
