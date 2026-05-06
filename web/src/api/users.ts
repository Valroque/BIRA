// Workspace user directory.
//
// Powers `useUsers()` — the workspace-wide UUID → display-name lookup used
// by issue assignee chips, mention rendering, comment author labels, etc.
//
// **Endpoint choice**: there is no `GET /api/tenants/:t/members` directory
// endpoint on the BE today (verified against `server/src/routes/tenants.ts`
// — `tenantMembersRouter` only carries admin actions: reset-password,
// deactivate, reactivate). The closest available read is
// `GET /api/tenants/:t/workspaces/:w/members`, which is open to any
// workspace member (read+) and returns the full active + invited roster
// alongside hydrated `user` payloads. We reuse it here and project the
// response down to the `WorkspaceUser` shape — every consumer of
// `useUsers()` only needs `id / displayName / email / avatar`, so the
// extra membership fields are dropped at the boundary.
//
// Tenant-scoped lookup (e.g. resolving the author of a comment from a
// user who has since left this workspace but still exists in the tenant)
// is a follow-up — it needs a new BE endpoint.

import { apiFetch } from './client';
import {
  adaptWorkspaceUser,
  type RawWorkspaceUser,
  type WorkspaceUser,
} from './adapters/user.adapter';
import type { RawWorkspaceMember } from './adapters/workspaceMember.adapter';

/**
 * List all users with a workspace membership in the given workspace.
 * Deactivated rows are filtered out (issue assignees should not include
 * users who have been globally deactivated). Returns directory rows in
 * BE response order — the caller is responsible for any sort.
 */
export async function listWorkspaceUsers(
  tenantSlug: string,
  workspaceSlug: string,
): Promise<WorkspaceUser[]> {
  const items = await apiFetch<RawWorkspaceMember[]>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/members`,
  );
  return items
    // The membership status `'deactivated'` mirrors the user's `isActive: false`
    // and (separately) a removed-from-this-workspace marker. Either way the
    // user is not a candidate for new mentions / assignments — drop them.
    .filter((m) => m.status !== 'deactivated' && m.user?.isActive !== false)
    .map((m) => adaptWorkspaceUser(m.user));
}

/**
 * Single-user lookup, tenant-scoped. Used by the UUID-fallback path in
 * `useUsers()`: when a uuid surfaces (comment author, mention target,
 * audit log entry) that isn't in the workspace directory, this resolves
 * the display name without forcing the BE to ship a tenant-wide directory
 * endpoint. 404 from the BE means "this user was never a tenant member"
 * — the provider caches that as a known-unknown and stops retrying.
 */
export async function getTenantUser(
  tenantSlug: string,
  userId: string,
): Promise<WorkspaceUser> {
  const raw = await apiFetch<RawWorkspaceUser>(
    `/api/tenants/${tenantSlug}/members/${userId}`,
  );
  return adaptWorkspaceUser(raw);
}
