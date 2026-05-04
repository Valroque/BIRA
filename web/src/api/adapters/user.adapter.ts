import { requireField, expectField } from '../lib/adapterContract';

// ---------------------------------------------------------------------------
// Raw BE shape
// ---------------------------------------------------------------------------

export interface RawUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  phone: string | null;
  isActive: boolean;
  mustResetPassword: boolean;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string | null;
  displayName: string;
}

// ---------------------------------------------------------------------------
// FE entity
// ---------------------------------------------------------------------------

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatar: string | null;
  phone: string | null;
  mustResetPassword: boolean;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function adaptUser(raw: RawUser): CurrentUser {
  const id = requireField(raw.id, '', { entity: 'User', field: 'id' });
  const email = requireField(raw.email, '', { entity: 'User', field: 'email', id });
  const firstName = requireField(raw.firstName, '', { entity: 'User', field: 'firstName', id });
  const lastName = requireField(raw.lastName, '', { entity: 'User', field: 'lastName', id });

  const displayName = expectField(
    raw.displayName || `${firstName} ${lastName}`.trim() || null,
    email,
    { entity: 'User', field: 'displayName', id },
  );

  return {
    id,
    email,
    firstName,
    lastName,
    displayName,
    avatar: raw.avatar ?? null,
    phone: raw.phone ?? null,
    mustResetPassword: raw.mustResetPassword ?? false,
  };
}
