// Project-access adapter — translates the BE's project access view + the
// flat effective-members list into FE-friendly entities.
//
// Two BE shapes feed this surface:
//
//   `GET .../projects/:p/access` returns `ProjectAccessView`:
//     {
//       projectId,
//       teams: [{ id, teamId, role: 'write'|'read', team: { id, slug, name, color, memberCount } }],
//       users: [{ id, userId, role: Role,            user: { id, email, firstName, lastName, avatar, displayName } }],
//     }
//
//   `GET .../projects/:p/access/effective-members` returns `ProjectEffectiveMember[]`:
//     [{
//       userId, role, provenance: 'explicit-user'|'tenant-admin'|'workspace-admin'|'team',
//       viaTeams?: [{ id, slug, name, role: 'write'|'read' }],
//       user: { id, email, firstName, lastName, avatar, displayName },
//     }]
//
// FE shape: a single `ProjectAccess` entity with `teams[]`, `users[]` and a
// pre-resolved `effective[]`. UUIDs (`teamId`, `userId`, `id`) are kept for
// mutation endpoints but never rendered — display fields are
// `displayName` / team `name` / `slug`.

import type { Role } from '../../fixtures';
import { requireField, expectField } from '../lib/adapterContract';

// ---------------------------------------------------------------------------
// Raw BE shapes
// ---------------------------------------------------------------------------

export interface RawTeamAccessView {
  /** UUID of the project_team_access row. */
  id: string;
  /** UUID of the team. */
  teamId: string;
  role: 'write' | 'read';
  team: {
    id: string;
    slug: string;
    name: string;
    color: string;
    memberCount: number;
  };
}

export interface RawUserAccessView {
  /** UUID of the project_user_access row. */
  id: string;
  /** UUID of the user. */
  userId: string;
  role: Role;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    displayName: string;
  };
}

export interface RawProjectAccess {
  projectId: string;
  teams: RawTeamAccessView[];
  users: RawUserAccessView[];
}

export type Provenance =
  | 'explicit-user'
  | 'tenant-admin'
  | 'workspace-admin'
  | 'team';

export interface RawEffectiveMemberViaTeam {
  id: string;
  slug: string;
  name: string;
  role: 'write' | 'read';
}

export interface RawEffectiveMember {
  userId: string;
  role: Role;
  provenance: Provenance;
  viaTeams?: RawEffectiveMemberViaTeam[];
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    displayName: string;
  };
}

// ---------------------------------------------------------------------------
// FE entities
// ---------------------------------------------------------------------------

export interface TeamAccess {
  /** UUID of the access-row. Never rendered. Used by PATCH/DELETE endpoints. */
  id: string;
  /** UUID of the team. Never rendered. Used by PATCH/DELETE endpoints. */
  teamId: string;
  /** Team-grant role — `write` or `read` only (admin is excluded from team grants). */
  role: 'write' | 'read';
  // Hydrated team fields — safe to render.
  teamSlug: string;
  teamName: string;
  teamColor: string;
  memberCount: number;
}

export interface UserAccess {
  /** UUID of the access-row. Never rendered. Used by PATCH/DELETE endpoints. */
  id: string;
  /** UUID of the user. Never rendered. */
  userId: string;
  /** User-grant role — full ladder including admin. */
  role: Role;
  // Hydrated user fields — safe to render.
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatar: string | null;
}

export interface EffectiveMemberViaTeam {
  /** UUID of the team. Never rendered. */
  id: string;
  slug: string;
  name: string;
  role: 'write' | 'read';
}

export interface EffectiveMember {
  /** UUID of the user. Never rendered. */
  userId: string;
  /** Final resolved role for this user on this project. */
  role: Role;
  /** How the user got the role — drives the "source" hint in the UI. */
  provenance: Provenance;
  /** Set when `provenance === 'team'` — the workspace teams that contributed. */
  viaTeams: EffectiveMemberViaTeam[];
  // Hydrated user fields — safe to render.
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatar: string | null;
}

export interface ProjectAccess {
  /** UUID of the project. Never rendered. */
  projectId: string;
  /** Team grants — each grants every team member access to the project. */
  teams: TeamAccess[];
  /** Explicit user grants — overrides any team-derived role for that user. */
  users: UserAccess[];
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

export function adaptTeamAccess(raw: RawTeamAccessView): TeamAccess {
  const id = requireField(raw.id, '', { entity: 'TeamAccess', field: 'id' });
  const teamId = requireField(raw.teamId, '', { entity: 'TeamAccess', field: 'teamId', id });
  const role = requireField<'write' | 'read'>(raw.role, 'read', {
    entity: 'TeamAccess', field: 'role', id,
  });
  const team = raw.team ?? ({} as Partial<RawTeamAccessView['team']>);
  const teamSlug = requireField(team.slug, '', {
    entity: 'TeamAccess', field: 'team.slug', id,
  });
  const teamName = requireField(team.name, '', {
    entity: 'TeamAccess', field: 'team.name', id,
  });
  const teamColor = expectField(team.color ?? '#6b7280', '#6b7280', {
    entity: 'TeamAccess', field: 'team.color', id,
  });
  const memberCount = typeof team.memberCount === 'number' ? team.memberCount : 0;

  return { id, teamId, role, teamSlug, teamName, teamColor, memberCount };
}

export function adaptUserAccess(raw: RawUserAccessView): UserAccess {
  const id = requireField(raw.id, '', { entity: 'UserAccess', field: 'id' });
  const userId = requireField(raw.userId, '', { entity: 'UserAccess', field: 'userId', id });
  const role = requireField<Role>(raw.role, 'read', {
    entity: 'UserAccess', field: 'role', id,
  });
  const u = raw.user ?? ({} as Partial<RawUserAccessView['user']>);
  const email = requireField(u.email, '', {
    entity: 'UserAccess', field: 'user.email', id,
  });
  const firstName = expectField(u.firstName ?? '', '', {
    entity: 'UserAccess', field: 'user.firstName', id,
  });
  const lastName = expectField(u.lastName ?? '', '', {
    entity: 'UserAccess', field: 'user.lastName', id,
  });
  const fallbackName = `${firstName} ${lastName}`.trim() || email;
  const displayName = expectField(u.displayName || fallbackName, fallbackName, {
    entity: 'UserAccess', field: 'user.displayName', id,
  });
  return {
    id,
    userId,
    role,
    email,
    firstName,
    lastName,
    displayName,
    avatar: u.avatar ?? null,
  };
}

export function adaptProjectAccess(raw: RawProjectAccess): ProjectAccess {
  const projectId = requireField(raw.projectId, '', {
    entity: 'ProjectAccess', field: 'projectId',
  });
  const teams = Array.isArray(raw.teams) ? raw.teams.map(adaptTeamAccess) : [];
  const users = Array.isArray(raw.users) ? raw.users.map(adaptUserAccess) : [];
  return { projectId, teams, users };
}

export function adaptEffectiveMember(raw: RawEffectiveMember): EffectiveMember {
  const userId = requireField(raw.userId, '', {
    entity: 'EffectiveMember', field: 'userId',
  });
  const role = requireField<Role>(raw.role, 'read', {
    entity: 'EffectiveMember', field: 'role', id: userId,
  });
  const provenance = requireField<Provenance>(raw.provenance, 'team', {
    entity: 'EffectiveMember', field: 'provenance', id: userId,
  });
  const u = raw.user ?? ({} as Partial<RawEffectiveMember['user']>);
  const email = requireField(u.email, '', {
    entity: 'EffectiveMember', field: 'user.email', id: userId,
  });
  const firstName = expectField(u.firstName ?? '', '', {
    entity: 'EffectiveMember', field: 'user.firstName', id: userId,
  });
  const lastName = expectField(u.lastName ?? '', '', {
    entity: 'EffectiveMember', field: 'user.lastName', id: userId,
  });
  const fallbackName = `${firstName} ${lastName}`.trim() || email;
  const displayName = expectField(u.displayName || fallbackName, fallbackName, {
    entity: 'EffectiveMember', field: 'user.displayName', id: userId,
  });
  const viaTeams = Array.isArray(raw.viaTeams)
    ? raw.viaTeams.map((vt) => ({
        id: vt.id,
        slug: vt.slug,
        name: vt.name,
        role: vt.role,
      }))
    : [];
  return {
    userId,
    role,
    provenance,
    viaTeams,
    email,
    firstName,
    lastName,
    displayName,
    avatar: u.avatar ?? null,
  };
}
