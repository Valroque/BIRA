// Tenant-level user admin actions.
//
// BE catalogue (verified — see `server/src/routes/tenantMembers.ts` and the
// mount in `server/src/routes/tenants.ts`):
//
//   POST /api/tenants/:t/members/:userId/reset-password
//   POST /api/tenants/:t/members/:userId/deactivate
//   POST /api/tenants/:t/members/:userId/reactivate
//
// All require tenant-admin role. The reset-password endpoint returns the
// plaintext temporary password EXACTLY ONCE; the FE surfaces it in a modal
// for the admin to copy + share OOB.

import { apiFetch } from './client';
import { adaptUser, type RawUser, type CurrentUser } from './adapters/user.adapter';

export interface AdminResetPasswordResult {
  user: CurrentUser;
  /** Plaintext temporary password — shown to the admin once, never logged. */
  temporaryPassword: string;
}

export async function adminResetPassword(
  tenantSlug: string,
  userId: string,
): Promise<AdminResetPasswordResult> {
  const data = await apiFetch<{ user: RawUser; temporaryPassword: string }>(
    `/api/tenants/${tenantSlug}/members/${userId}/reset-password`,
    { method: 'POST' },
  );
  return {
    user: adaptUser(data.user),
    temporaryPassword: data.temporaryPassword,
  };
}

export async function deactivateUser(
  tenantSlug: string,
  userId: string,
): Promise<CurrentUser> {
  const raw = await apiFetch<RawUser>(
    `/api/tenants/${tenantSlug}/members/${userId}/deactivate`,
    { method: 'POST' },
  );
  return adaptUser(raw);
}

export async function reactivateUser(
  tenantSlug: string,
  userId: string,
): Promise<CurrentUser> {
  const raw = await apiFetch<RawUser>(
    `/api/tenants/${tenantSlug}/members/${userId}/reactivate`,
    { method: 'POST' },
  );
  return adaptUser(raw);
}
