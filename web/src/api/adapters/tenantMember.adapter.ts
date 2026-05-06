// Adapter for the tenant-member directory.
//
// BE shape (from `server/src/services/membershipService.ts → TenantMemberView`):
//   {
//     membershipId, userId, tenantId, role, status,
//     lastSeenAt, createdAt, updatedAt,
//     user: { id, email, firstName, lastName, avatar, isActive, displayName },
//   }
//
// FE shape: a denormalised flat row that the Tenant settings → Members
// table can render directly. UUIDs (`membershipId`, `userId`, `tenantId`)
// are kept for mutations + lookups but never rendered — display fields
// are `displayName` / `email` / `firstName` / `lastName`.

import type { Role } from '../../fixtures';
import { requireField, expectField } from '../lib/adapterContract';

// ---------------------------------------------------------------------------
// Raw BE shape
// ---------------------------------------------------------------------------

export interface RawTenantMemberUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  isActive: boolean;
  displayName: string;
}

export interface RawTenantMember {
  membershipId: string;
  userId: string;
  tenantId: string;
  role: Role;
  status: 'active' | 'invited' | 'deactivated';
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  user: RawTenantMemberUser;
}

// ---------------------------------------------------------------------------
// FE entity
// ---------------------------------------------------------------------------

export interface TenantMember {
  /** UUID — primary identity of the tenant_membership row. Never rendered. */
  membershipId: string;
  /** UUID of the user. Never rendered. Used by admin-action endpoints. */
  userId: string;
  /** UUID of the tenant. Never rendered. */
  tenantId: string;
  /** Tenant-level role (admin / write / read). */
  role: Role;
  /** Tenant-membership status (active / invited / deactivated). */
  status: 'active' | 'invited' | 'deactivated';
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string | null;
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

export function adaptTenantMember(raw: RawTenantMember): TenantMember {
  const membershipId = requireField(raw.membershipId, '', {
    entity: 'TenantMember', field: 'membershipId',
  });
  const userId = requireField(raw.userId, '', {
    entity: 'TenantMember', field: 'userId', id: membershipId,
  });
  const tenantId = requireField(raw.tenantId, '', {
    entity: 'TenantMember', field: 'tenantId', id: membershipId,
  });
  const role = requireField<Role>(raw.role, 'read', {
    entity: 'TenantMember', field: 'role', id: membershipId,
  });
  const status = expectField<'active' | 'invited' | 'deactivated'>(
    raw.status, 'active',
    { entity: 'TenantMember', field: 'status', id: membershipId },
  );

  const rawUser = raw.user ?? ({} as Partial<RawTenantMemberUser>);
  const email = requireField(rawUser.email, '', {
    entity: 'TenantMember', field: 'user.email', id: membershipId,
  });
  const firstName = expectField(rawUser.firstName ?? '', '', {
    entity: 'TenantMember', field: 'user.firstName', id: membershipId,
  });
  const lastName = expectField(rawUser.lastName ?? '', '', {
    entity: 'TenantMember', field: 'user.lastName', id: membershipId,
  });
  const displayName = expectField(
    rawUser.displayName || `${firstName} ${lastName}`.trim() || null,
    email,
    { entity: 'TenantMember', field: 'user.displayName', id: membershipId },
  );

  return {
    membershipId,
    userId,
    tenantId,
    role,
    status,
    lastSeenAt: raw.lastSeenAt ?? null,
    createdAt: raw.createdAt ?? '',
    updatedAt: raw.updatedAt ?? null,
    userIsActive: rawUser.isActive ?? true,
    email,
    firstName,
    lastName,
    displayName,
    avatar: rawUser.avatar ?? null,
  };
}
