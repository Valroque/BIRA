import { requireField, expectField } from '../lib/adapterContract';

// ---------------------------------------------------------------------------
// Raw BE shape — `RawUser` is the canonical user wire shape emitted by
// `/api/auth/profile` and `PATCH /api/auth/me`. The `WorkspaceUser` directory
// (slice 13) reuses the same fields plus `displayName`; the BE's
// `WorkspaceMemberView.user` payload is shape-compatible.
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

// Subset of `RawUser` actually returned inside `WorkspaceMemberView.user`
// (see `server/src/services/membershipService.ts → WorkspaceMemberView`).
// Phone / mustResetPassword / lastLogin / timestamps are NOT included on
// directory rows — only the fields needed to render a name + avatar.
export interface RawWorkspaceUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  isActive: boolean;
  displayName: string;
}

// ---------------------------------------------------------------------------
// FE entities
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

/**
 * Directory-row shape returned by `useUsers()` for resolving issue
 * `assigneeUserId`, comment author, and mention targets to a display name.
 *
 * `id` is a UUID — never rendered. `displayName` is always safe to render
 * (falls back to email when the BE doesn't supply one). Deactivated users
 * are filtered out at the provider boundary, so callers don't have to
 * special-case `isActive`.
 */
export interface WorkspaceUser {
  /** UUID — primary identity. Never rendered. */
  id: string;
  email: string;
  /** Best-effort first/last split. Empty when the BE only sent a displayName. */
  firstName: string;
  lastName: string;
  /** `firstName lastName` falling back to email. Always safe to render. */
  displayName: string;
  /** Avatar URL when available; otherwise null and callers fall back to initials. */
  avatar: string | null;
}

// ---------------------------------------------------------------------------
// Adapters
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

/**
 * Adapt a directory row (the `user` payload from
 * `WorkspaceMemberView`). Names that fall through return empty strings
 * rather than throwing — a contract breach on a single row shouldn't
 * blank the whole directory. `displayName` always degrades to email.
 */
export function adaptWorkspaceUser(raw: RawWorkspaceUser): WorkspaceUser {
  const id = requireField(raw.id, '', { entity: 'WorkspaceUser', field: 'id' });
  const email = requireField(raw.email, '', { entity: 'WorkspaceUser', field: 'email', id });
  const firstName = expectField(raw.firstName ?? '', '', {
    entity: 'WorkspaceUser', field: 'firstName', id,
  });
  const lastName = expectField(raw.lastName ?? '', '', {
    entity: 'WorkspaceUser', field: 'lastName', id,
  });
  const displayName = expectField(
    raw.displayName || `${firstName} ${lastName}`.trim() || null,
    email,
    { entity: 'WorkspaceUser', field: 'displayName', id },
  );
  return {
    id,
    email,
    firstName,
    lastName,
    displayName,
    avatar: raw.avatar ?? null,
  };
}
