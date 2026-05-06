// Teams API.
//
// BE catalogue (verified — see `server/src/routes/teams.ts` and the mount
// at `server/src/routes/tenants.ts:182`):
//
//   GET    /api/tenants/:t/workspaces/:w/teams                          — any workspace member
//   POST   /api/tenants/:t/workspaces/:w/teams       { slug, name, color, description? }  — admin
//   GET    /api/tenants/:t/workspaces/:w/teams/:teamSlug
//   PATCH  /api/tenants/:t/workspaces/:w/teams/:teamSlug   { name?, description?, color? } — admin
//   DELETE /api/tenants/:t/workspaces/:w/teams/:teamSlug                                    — admin
//   GET    /api/tenants/:t/workspaces/:w/teams/:teamSlug/members
//   POST   /api/tenants/:t/workspaces/:w/teams/:teamSlug/members   { userId } — admin
//   DELETE /api/tenants/:t/workspaces/:w/teams/:teamSlug/members/:userId       — admin
//
// All mutation endpoints return the updated TeamView with refreshed
// `members[]`. `slug` is intentionally not patchable (URL-load-bearing).

import { apiFetch } from './client';
import {
  adaptTeam, adaptTeamMember,
  type RawTeam, type RawTeamMember, type Team, type TeamMember,
} from './adapters/team.adapter';

const base = (tenantSlug: string, workspaceSlug: string) =>
  `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/teams`;

export interface CreateTeamInput {
  slug: string;
  name: string;
  color: string;
  description?: string;
}

export interface UpdateTeamInput {
  name?: string;
  description?: string;
  color?: string;
}

export async function listTeams(
  tenantSlug: string,
  workspaceSlug: string,
): Promise<Team[]> {
  const items = await apiFetch<RawTeam[]>(base(tenantSlug, workspaceSlug));
  return items.map(adaptTeam);
}

export async function getTeam(
  tenantSlug: string,
  workspaceSlug: string,
  teamSlug: string,
): Promise<Team> {
  const raw = await apiFetch<RawTeam>(`${base(tenantSlug, workspaceSlug)}/${teamSlug}`);
  return adaptTeam(raw);
}

export async function createTeam(
  tenantSlug: string,
  workspaceSlug: string,
  input: CreateTeamInput,
): Promise<Team> {
  const raw = await apiFetch<RawTeam>(base(tenantSlug, workspaceSlug), {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return adaptTeam(raw);
}

export async function updateTeam(
  tenantSlug: string,
  workspaceSlug: string,
  teamSlug: string,
  patch: UpdateTeamInput,
): Promise<Team> {
  const raw = await apiFetch<RawTeam>(
    `${base(tenantSlug, workspaceSlug)}/${teamSlug}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
  return adaptTeam(raw);
}

export async function deleteTeam(
  tenantSlug: string,
  workspaceSlug: string,
  teamSlug: string,
): Promise<void> {
  await apiFetch<void>(
    `${base(tenantSlug, workspaceSlug)}/${teamSlug}`,
    { method: 'DELETE' },
  );
}

export async function listTeamMembers(
  tenantSlug: string,
  workspaceSlug: string,
  teamSlug: string,
): Promise<TeamMember[]> {
  const items = await apiFetch<RawTeamMember[]>(
    `${base(tenantSlug, workspaceSlug)}/${teamSlug}/members`,
  );
  // The BE returns `RawTeamMember[]` directly (no team wrapper); reuse
  // the per-member adapter with the team slug as a debug id.
  return items.map((m) => adaptTeamMember(m, teamSlug));
}

export async function addTeamMember(
  tenantSlug: string,
  workspaceSlug: string,
  teamSlug: string,
  userId: string,
): Promise<Team> {
  const raw = await apiFetch<RawTeam>(
    `${base(tenantSlug, workspaceSlug)}/${teamSlug}/members`,
    { method: 'POST', body: JSON.stringify({ userId }) },
  );
  return adaptTeam(raw);
}

export async function removeTeamMember(
  tenantSlug: string,
  workspaceSlug: string,
  teamSlug: string,
  userId: string,
): Promise<Team> {
  const raw = await apiFetch<RawTeam>(
    `${base(tenantSlug, workspaceSlug)}/${teamSlug}/members/${userId}`,
    { method: 'DELETE' },
  );
  return adaptTeam(raw);
}
