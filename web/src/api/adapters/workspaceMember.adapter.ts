// Adapter for the workspace-member directory.
//
// BE shape (from `server/src/services/membershipService.ts → WorkspaceMemberView`):
//   {
//     membershipId, userId, workspaceId, role, status,
//     lastSeenAt, createdAt, updatedAt,
//     user: { id, email, firstName, lastName, avatar, isActive, displayName },
//     tenantAdmin: boolean,
//   }
//
// FE shape: a denormalised flat row that the Settings → Members table can
// render directly. UUIDs (`membershipId`, `userId`) are kept for mutations
// and lookups but never rendered — display fields are `displayName` /
// `email` / `firstName` / `lastName`.

import type { Role } from '../../fixtures';
import { requireField, expectField } from '../lib/adapterContract';

// ---------------------------------------------------------------------------
// Raw BE shape
// ---------------------------------------------------------------------------

export interface RawWorkspaceMemberUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  isActive: boolean;
  displayName: string;
}

export interface RawWorkspaceMember {
  membershipId: string;
  userId: string;
  workspaceId: string;
  role: Role;
  status: 'active' | 'invited' | 'deactivated';
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  user: RawWorkspaceMemberUser;
  /** True when the user is also a tenant admin (implicit-admin everywhere). */
  tenantAdmin: boolean;
}

// ---------------------------------------------------------------------------
// FE entity
// ---------------------------------------------------------------------------

export interface WorkspaceMember {
  /** UUID — primary identity of the workspace_membership row. Never rendered. */
  membershipId: string;
  /** UUID of the user. Never rendered. Used by admin-action endpoints. */
  userId: string;
  /** UUID of the workspace. Never rendered. */
  workspaceId: string;
  /** Stored membership role (workspace-level). For tenant admins this is the */
  /* row's value; the effective role is admin via `tenantAdmin`. */
  role: Role;
  /** Effective role in this workspace — `admin` when `tenantAdmin`, else `role`. */
  effectiveRole: Role;
  /** Tenant-membership status (active / invited / deactivated). */
  status: 'active' | 'invited' | 'deactivated';
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  /** True when the user is a tenant admin — implicit admin in every workspace. */
  tenantAdmin: boolean;
  /** True when the user account is globally active. */
  userIsActive: boolean;
  // Hydrated user fields — safe to render.
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatar: string | null;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function adaptWorkspaceMember(raw: RawWorkspaceMember): WorkspaceMember {
  const membershipId = requireField(raw.membershipId, '', {
    entity: 'WorkspaceMember', field: 'membershipId',
  });
  const userId = requireField(raw.userId, '', {
    entity: 'WorkspaceMember', field: 'userId', id: membershipId,
  });
  const workspaceId = requireField(raw.workspaceId, '', {
    entity: 'WorkspaceMember', field: 'workspaceId', id: membershipId,
  });
  const role = requireField<Role>(raw.role, 'read', {
    entity: 'WorkspaceMember', field: 'role', id: membershipId,
  });
  const status = expectField<'active' | 'invited' | 'deactivated'>(
    raw.status, 'active',
    { entity: 'WorkspaceMember', field: 'status', id: membershipId },
  );

  const rawUser = raw.user ?? ({} as Partial<RawWorkspaceMemberUser>);
  const email = requireField(rawUser.email, '', {
    entity: 'WorkspaceMember', field: 'user.email', id: membershipId,
  });
  const firstName = expectField(rawUser.firstName ?? '', '', {
    entity: 'WorkspaceMember', field: 'user.firstName', id: membershipId,
  });
  const lastName = expectField(rawUser.lastName ?? '', '', {
    entity: 'WorkspaceMember', field: 'user.lastName', id: membershipId,
  });
  const displayName = expectField(
    rawUser.displayName || `${firstName} ${lastName}`.trim() || null,
    email,
    { entity: 'WorkspaceMember', field: 'user.displayName', id: membershipId },
  );

  const tenantAdmin = Boolean(raw.tenantAdmin);
  const effectiveRole: Role = tenantAdmin ? 'admin' : role;

  return {
    membershipId,
    userId,
    workspaceId,
    role,
    effectiveRole,
    status,
    lastSeenAt: raw.lastSeenAt ?? null,
    createdAt: raw.createdAt ?? '',
    updatedAt: raw.updatedAt ?? null,
    tenantAdmin,
    userIsActive: rawUser.isActive ?? true,
    email,
    firstName,
    lastName,
    displayName,
    avatar: rawUser.avatar ?? null,
  };
}
