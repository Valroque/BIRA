// Teams — runtime state, scoped per (tenant, workspace).
//
// Mounted in `WorkspaceLayout` (App.tsx) with `key={`${tenant}/${workspace}`}`,
// so navigating across pairs reloads the directory cleanly. Open to any
// workspace member; mutations are admin-only on the BE (the consumer-side
// guards live in `screens/teams.tsx` and just hide / disable controls so
// users don't get a surprise 403).
//
// The list endpoint (`GET .../teams`) returns each Team with its full
// `members[]` already hydrated, so we don't need a separate fetch for
// rosters — the team-detail screen reads from the cached list. We still
// expose `refreshTeam(slug)` so the detail page can revalidate on mount
// (cheap, single team) and so admin actions that don't go through the
// provider can ask for a re-pull.

import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from 'react';
import {
  listTeams as apiListTeams,
  getTeam as apiGetTeam,
  createTeam as apiCreateTeam,
  updateTeam as apiUpdateTeam,
  deleteTeam as apiDeleteTeam,
  addTeamMember as apiAddTeamMember,
  removeTeamMember as apiRemoveTeamMember,
  type CreateTeamInput, type UpdateTeamInput,
} from '../api/teams';
import type { Team } from '../api/adapters/team.adapter';

export interface TeamsCtxValue {
  teams: Team[];
  loading: boolean;
  error: string | null;
  /** Lookup by slug or UUID. Slug is the primary key callers will have (URLs). */
  getTeam: (slugOrId: string) => Team | undefined;
  /** Re-fetch the directory. Does not toggle `loading`. */
  refresh: () => Promise<void>;
  /**
   * Re-fetch a single team and merge it into the cache. Used by the team
   * detail screen on mount so the roster is fresh even if the list cache
   * was warmed long ago. Throws on API failure.
   */
  refreshTeam: (teamSlug: string) => Promise<Team>;
  /** Create a new team. Throws on failure. */
  create: (input: CreateTeamInput) => Promise<Team>;
  /** Patch name / description / color. Throws on failure. */
  update: (teamSlug: string, patch: UpdateTeamInput) => Promise<Team>;
  /** Delete a team. Throws on failure. */
  remove: (teamSlug: string) => Promise<void>;
  /** Add a workspace user to a team. Throws on failure. */
  addMember: (teamSlug: string, userId: string) => Promise<Team>;
  /** Remove a user from a team. Throws on failure. */
  removeMember: (teamSlug: string, userId: string) => Promise<Team>;
}

const TeamsContext = createContext<TeamsCtxValue | undefined>(undefined);

export function TeamsProvider({
  tenant, workspace, children,
}: {
  tenant: string; workspace: string; children: ReactNode;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (toggleLoading: boolean) => {
    if (!tenant || !workspace) {
      if (toggleLoading) setLoading(false);
      return;
    }
    if (toggleLoading) setLoading(true);
    try {
      const items = await apiListTeams(tenant, workspace);
      setTeams(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    } finally {
      if (toggleLoading) setLoading(false);
    }
  }, [tenant, workspace]);

  useEffect(() => { void load(true); }, [load]);

  const getTeam = useCallback(
    (slugOrId: string) => teams.find((t) => t.slug === slugOrId || t.id === slugOrId),
    [teams],
  );

  const refresh = useCallback(() => load(false), [load]);

  // Replace one team in the cache by slug (after a mutation response). Falls
  // back to appending when no row exists yet — keeps the cache eventually-
  // consistent without a full re-fetch.
  const upsertOne = useCallback((team: Team) => {
    setTeams((prev) => {
      const idx = prev.findIndex((t) => t.id === team.id);
      if (idx === -1) return [...prev, team];
      const copy = [...prev];
      copy[idx] = team;
      return copy;
    });
  }, []);

  const refreshTeam = useCallback(async (teamSlug: string): Promise<Team> => {
    const fresh = await apiGetTeam(tenant, workspace, teamSlug);
    upsertOne(fresh);
    return fresh;
  }, [tenant, workspace, upsertOne]);

  const create = useCallback(async (input: CreateTeamInput): Promise<Team> => {
    const created = await apiCreateTeam(tenant, workspace, input);
    upsertOne(created);
    return created;
  }, [tenant, workspace, upsertOne]);

  const update = useCallback(async (teamSlug: string, patch: UpdateTeamInput): Promise<Team> => {
    const updated = await apiUpdateTeam(tenant, workspace, teamSlug, patch);
    upsertOne(updated);
    return updated;
  }, [tenant, workspace, upsertOne]);

  const remove = useCallback(async (teamSlug: string): Promise<void> => {
    await apiDeleteTeam(tenant, workspace, teamSlug);
    setTeams((prev) => prev.filter((t) => t.slug !== teamSlug));
  }, [tenant, workspace]);

  const addMember = useCallback(async (teamSlug: string, userId: string): Promise<Team> => {
    const updated = await apiAddTeamMember(tenant, workspace, teamSlug, userId);
    upsertOne(updated);
    return updated;
  }, [tenant, workspace, upsertOne]);

  const removeMember = useCallback(async (teamSlug: string, userId: string): Promise<Team> => {
    const updated = await apiRemoveTeamMember(tenant, workspace, teamSlug, userId);
    upsertOne(updated);
    return updated;
  }, [tenant, workspace, upsertOne]);

  const value: TeamsCtxValue = {
    teams, loading, error,
    getTeam, refresh, refreshTeam,
    create, update, remove, addMember, removeMember,
  };

  return <TeamsContext.Provider value={value}>{children}</TeamsContext.Provider>;
}

export function useTeams(): TeamsCtxValue {
  const ctx = useContext(TeamsContext);
  if (!ctx) throw new Error('useTeams must be used within TeamsProvider');
  return ctx;
}
