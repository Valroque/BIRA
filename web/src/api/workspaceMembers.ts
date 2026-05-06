// Workspace-member API.
//
// BE catalogue (verified — see `server/src/routes/workspaceMembers.ts` and
// `server/src/routes/tenants.ts` for the mount):
//
//   GET    /api/tenants/:t/workspaces/:w/members
//   POST   /api/tenants/:t/workspaces/:w/members            { userId, role }
//   PATCH  /api/tenants/:t/workspaces/:w/members/:id        { role }
//   DELETE /api/tenants/:t/workspaces/:w/members/:id
//
// All admin-gated server-side. The list endpoint is open to any workspace
// member (read+) so the directory can render without elevation.

import { apiFetch } from './client';
import type { Role } from '../fixtures';
import {
  adaptWorkspaceMember,
  type RawWorkspaceMember,
  type WorkspaceMember,
} from './adapters/workspaceMember.adapter';

const base = (tenantSlug: string, workspaceSlug: string) =>
  `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/members`;

export async function listWorkspaceMembers(
  tenantSlug: string,
  workspaceSlug: string,
): Promise<WorkspaceMember[]> {
  const items = await apiFetch<RawWorkspaceMember[]>(base(tenantSlug, workspaceSlug));
  return items.map(adaptWorkspaceMember);
}

export async function addWorkspaceMember(
  tenantSlug: string,
  workspaceSlug: string,
  payload: { userId: string; role: Role },
): Promise<WorkspaceMember> {
  const raw = await apiFetch<RawWorkspaceMember>(base(tenantSlug, workspaceSlug), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return adaptWorkspaceMember(raw);
}

export async function updateWorkspaceMemberRole(
  tenantSlug: string,
  workspaceSlug: string,
  membershipId: string,
  role: Role,
): Promise<WorkspaceMember> {
  const raw = await apiFetch<RawWorkspaceMember>(
    `${base(tenantSlug, workspaceSlug)}/${membershipId}`,
    { method: 'PATCH', body: JSON.stringify({ role }) },
  );
  return adaptWorkspaceMember(raw);
}

export async function removeWorkspaceMember(
  tenantSlug: string,
  workspaceSlug: string,
  membershipId: string,
): Promise<void> {
  await apiFetch<void>(
    `${base(tenantSlug, workspaceSlug)}/${membershipId}`,
    { method: 'DELETE' },
  );
}
