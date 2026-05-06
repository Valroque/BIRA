// Project access API client — team grants + user grants.
//
// BE catalogue (verified — see `server/src/routes/projectAccess.ts` and
// the mount in `server/src/routes/projects.ts`):
//
//   GET    /api/tenants/:t/workspaces/:w/projects/:p/access
//   GET    /api/tenants/:t/workspaces/:w/projects/:p/access/effective-members
//   POST   /api/tenants/:t/workspaces/:w/projects/:p/access/teams      { teamId, role }
//   PATCH  /api/tenants/:t/workspaces/:w/projects/:p/access/teams/:id  { role }
//   DELETE /api/tenants/:t/workspaces/:w/projects/:p/access/teams/:id
//   POST   /api/tenants/:t/workspaces/:w/projects/:p/access/users      { userId, role }
//   PATCH  /api/tenants/:t/workspaces/:w/projects/:p/access/users/:id  { role }
//   DELETE /api/tenants/:t/workspaces/:w/projects/:p/access/users/:id
//
// All mutations are workspace-admin gated server-side. The list endpoints are
// open to any workspace member.
//
// **Team-grant role rule**: the BE refuses `admin` on team grants — admin is
// only ever assigned explicitly to a user. The FE picker is responsible for
// keeping `admin` out of the team-grant role dropdown so the rule stays
// visible (the BE will return 400 otherwise).

import { apiFetch } from './client';
import type { Role } from '../fixtures';
import {
  adaptProjectAccess, adaptEffectiveMember,
  type RawProjectAccess, type RawEffectiveMember,
  type ProjectAccess, type EffectiveMember,
} from './adapters/projectAccess.adapter';

const base = (tenantSlug: string, workspaceSlug: string, projectSlug: string) =>
  `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/access`;

export async function getProjectAccess(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
): Promise<ProjectAccess> {
  const raw = await apiFetch<RawProjectAccess>(base(tenantSlug, workspaceSlug, projectSlug));
  return adaptProjectAccess(raw);
}

export async function getEffectiveMembers(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
): Promise<EffectiveMember[]> {
  const items = await apiFetch<RawEffectiveMember[]>(
    `${base(tenantSlug, workspaceSlug, projectSlug)}/effective-members`,
  );
  return items.map(adaptEffectiveMember);
}

// ── Team-grant mutations ───────────────────────────────────────────────────

export async function grantTeamAccess(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  teamId: string,
  role: 'write' | 'read',
): Promise<ProjectAccess> {
  const raw = await apiFetch<RawProjectAccess>(
    `${base(tenantSlug, workspaceSlug, projectSlug)}/teams`,
    { method: 'POST', body: JSON.stringify({ teamId, role }) },
  );
  return adaptProjectAccess(raw);
}

export async function updateTeamAccess(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  teamId: string,
  role: 'write' | 'read',
): Promise<ProjectAccess> {
  const raw = await apiFetch<RawProjectAccess>(
    `${base(tenantSlug, workspaceSlug, projectSlug)}/teams/${teamId}`,
    { method: 'PATCH', body: JSON.stringify({ role }) },
  );
  return adaptProjectAccess(raw);
}

export async function revokeTeamAccess(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  teamId: string,
): Promise<ProjectAccess> {
  const raw = await apiFetch<RawProjectAccess>(
    `${base(tenantSlug, workspaceSlug, projectSlug)}/teams/${teamId}`,
    { method: 'DELETE' },
  );
  return adaptProjectAccess(raw);
}

// ── User-grant mutations ───────────────────────────────────────────────────

export async function grantUserAccess(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  userId: string,
  role: Role,
): Promise<ProjectAccess> {
  const raw = await apiFetch<RawProjectAccess>(
    `${base(tenantSlug, workspaceSlug, projectSlug)}/users`,
    { method: 'POST', body: JSON.stringify({ userId, role }) },
  );
  return adaptProjectAccess(raw);
}

export async function updateUserAccess(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  userId: string,
  role: Role,
): Promise<ProjectAccess> {
  const raw = await apiFetch<RawProjectAccess>(
    `${base(tenantSlug, workspaceSlug, projectSlug)}/users/${userId}`,
    { method: 'PATCH', body: JSON.stringify({ role }) },
  );
  return adaptProjectAccess(raw);
}

export async function revokeUserAccess(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  userId: string,
): Promise<ProjectAccess> {
  const raw = await apiFetch<RawProjectAccess>(
    `${base(tenantSlug, workspaceSlug, projectSlug)}/users/${userId}`,
    { method: 'DELETE' },
  );
  return adaptProjectAccess(raw);
}
