// Team + team-member adapters.
//
// Teams are workspace-scoped collections of users used to grant project
// access in bulk. UUIDs (`id`, `userId`) are kept for mutation endpoints
// but never rendered — display is driven by `name` / `slug` / `displayName`.
//
// BE shape (from `server/src/services/teamService.ts → TeamView`):
//   {
//     id, workspaceId, slug, name, description, color,
//     createdByUserId, createdAt, updatedAt,
//     memberCount,
//     members: [
//       { userId, email, firstName, lastName, avatar, displayName }
//     ]
//   }

import { requireField, expectField } from '../lib/adapterContract';

// ---------------------------------------------------------------------------
// Raw BE shape
// ---------------------------------------------------------------------------

export interface RawTeamMember {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  displayName: string;
}

export interface RawTeam {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string;
  color: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string | null;
  memberCount: number;
  members: RawTeamMember[];
}

// ---------------------------------------------------------------------------
// FE entities
// ---------------------------------------------------------------------------

/** A user belonging to a team. UUIDs never render. */
export interface TeamMember {
  /** UUID of the user. Never rendered. Used for remove-member endpoint. */
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  /** `firstName lastName`, falls back to email. Always safe to render. */
  displayName: string;
  avatar: string | null;
}

export interface Team {
  /** UUID of the team row. Never rendered. */
  id: string;
  /** UUID of the parent workspace. Never rendered. */
  workspaceId: string;
  /** URL-load-bearing slug — also the human ref for the team. */
  slug: string;
  name: string;
  description: string;
  /** Hex (or other CSS color) used to tint the team chip background. */
  color: string;
  /** UUID of the user that created the team. Never rendered. */
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string | null;
  /** Mirror of `members.length`; the BE returns it pre-counted. */
  memberCount: number;
  /** Members hydrated by the BE on every fetch (list + detail). */
  members: TeamMember[];
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function adaptTeamMember(raw: RawTeamMember, teamId: string): TeamMember {
  const userId = requireField(raw.userId, '', {
    entity: 'TeamMember', field: 'userId', id: teamId,
  });
  const email = requireField(raw.email, '', {
    entity: 'TeamMember', field: 'email', id: teamId,
  });
  const firstName = expectField(raw.firstName ?? '', '', {
    entity: 'TeamMember', field: 'firstName', id: teamId,
  });
  const lastName = expectField(raw.lastName ?? '', '', {
    entity: 'TeamMember', field: 'lastName', id: teamId,
  });
  const fallbackName = `${firstName} ${lastName}`.trim() || email;
  const displayName = expectField(
    raw.displayName || fallbackName,
    fallbackName,
    { entity: 'TeamMember', field: 'displayName', id: teamId },
  );
  return {
    userId,
    email,
    firstName,
    lastName,
    displayName,
    avatar: raw.avatar ?? null,
  };
}

export function adaptTeam(raw: RawTeam): Team {
  const id = requireField(raw.id, '', { entity: 'Team', field: 'id' });
  const workspaceId = requireField(raw.workspaceId, '', {
    entity: 'Team', field: 'workspaceId', id,
  });
  const slug = requireField(raw.slug, '', { entity: 'Team', field: 'slug', id });
  const name = requireField(raw.name, '', { entity: 'Team', field: 'name', id });
  const color = requireField(raw.color, '#6b7280', {
    entity: 'Team', field: 'color', id,
  });
  const description = expectField(raw.description ?? '', '', {
    entity: 'Team', field: 'description', id,
  });
  const rawMembers = Array.isArray(raw.members) ? raw.members : [];
  const members = rawMembers.map((m) => adaptTeamMember(m, id));
  return {
    id,
    workspaceId,
    slug,
    name,
    description,
    color,
    createdByUserId: raw.createdByUserId ?? null,
    createdAt: raw.createdAt ?? '',
    updatedAt: raw.updatedAt ?? null,
    memberCount: typeof raw.memberCount === 'number' ? raw.memberCount : members.length,
    members,
  };
}
