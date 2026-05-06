// Project access — runtime state, scoped per (tenant, workspace, project).
//
// Mounted at the project-members + project-settings screens with a
// `key={`${tenant}/${workspace}/${project}`}` so navigating between projects
// remounts cleanly. The two surfaces share the same provider instance via the
// `<ProjectAccessGate>` wrapper to keep a single fetch per project visit.
//
// The provider holds **two** parallel views:
//
//   1. `access`   — `{ teams[], users[] }` from `GET /access`. Source of truth
//                   for the team-grants and user-overrides sections; mutations
//                   replace this from the BE response.
//   2. `effective`— `EffectiveMember[]` from `GET /access/effective-members`.
//                   Read-only resolved view powering the bottom section. We
//                   always re-fetch this after any mutation since changing a
//                   team/user grant can flip the resolution for many users at
//                   once and the BE owns the precedence rule.
//
// Why split: the access view is small and immediately usable for the editing
// surfaces; the effective view requires a per-user reduce on the BE and is
// only needed for the debug/explain surface. Separate fetches let us refresh
// only what changed without two network chains.

import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from 'react';
import {
  getProjectAccess as apiGetProjectAccess,
  getEffectiveMembers as apiGetEffectiveMembers,
  grantTeamAccess as apiGrantTeamAccess,
  updateTeamAccess as apiUpdateTeamAccess,
  revokeTeamAccess as apiRevokeTeamAccess,
  grantUserAccess as apiGrantUserAccess,
  updateUserAccess as apiUpdateUserAccess,
  revokeUserAccess as apiRevokeUserAccess,
} from '../api/projectAccess';
import type {
  ProjectAccess, EffectiveMember,
} from '../api/adapters/projectAccess.adapter';
import type { Role } from '../fixtures';

export interface ProjectAccessCtxValue {
  access: ProjectAccess | null;
  effective: EffectiveMember[];
  loading: boolean;
  /** True while a mutation (grant/update/revoke) is in flight. */
  saving: boolean;
  error: string | null;
  /** Re-fetch both access + effective. Does not toggle `loading`. */
  refresh: () => Promise<void>;
  // ── Team grants ─────────────────────────────────────────────────────────
  grantTeam: (teamId: string, role: 'write' | 'read') => Promise<void>;
  updateTeam: (teamId: string, role: 'write' | 'read') => Promise<void>;
  revokeTeam: (teamId: string) => Promise<void>;
  // ── User grants ─────────────────────────────────────────────────────────
  grantUser: (userId: string, role: Role) => Promise<void>;
  updateUser: (userId: string, role: Role) => Promise<void>;
  revokeUser: (userId: string) => Promise<void>;
}

const ProjectAccessContext = createContext<ProjectAccessCtxValue | undefined>(undefined);

export function ProjectAccessProvider({
  tenant, workspace, project, children,
}: {
  tenant: string; workspace: string; project: string; children: ReactNode;
}) {
  const [access, setAccess] = useState<ProjectAccess | null>(null);
  const [effective, setEffective] = useState<EffectiveMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (toggleLoading: boolean) => {
    if (!tenant || !workspace || !project) {
      if (toggleLoading) setLoading(false);
      return;
    }
    if (toggleLoading) setLoading(true);
    try {
      const [a, eff] = await Promise.all([
        apiGetProjectAccess(tenant, workspace, project),
        apiGetEffectiveMembers(tenant, workspace, project),
      ]);
      setAccess(a);
      setEffective(eff);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project access');
    } finally {
      if (toggleLoading) setLoading(false);
    }
  }, [tenant, workspace, project]);

  useEffect(() => { void load(true); }, [load]);

  const refresh = useCallback(() => load(false), [load]);

  // After every mutation we (a) replace `access` from the BE response — the
  // mutation endpoints all return the post-mutation `ProjectAccessView` — and
  // (b) re-fetch the effective list since precedence can flip for many users
  // at once and the BE owns that rule.
  const refetchEffective = useCallback(async () => {
    try {
      const eff = await apiGetEffectiveMembers(tenant, workspace, project);
      setEffective(eff);
    } catch {
      // Effective is the read-only debug surface — a stale list isn't fatal.
      // The next refresh / mutation will reconcile.
    }
  }, [tenant, workspace, project]);

  const runMutation = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setSaving(true);
    try {
      const result = await fn();
      return result;
    } finally {
      setSaving(false);
    }
  }, []);

  const grantTeam = useCallback(async (teamId: string, role: 'write' | 'read') => {
    const updated = await runMutation(() => apiGrantTeamAccess(tenant, workspace, project, teamId, role));
    setAccess(updated);
    await refetchEffective();
  }, [tenant, workspace, project, runMutation, refetchEffective]);

  const updateTeam = useCallback(async (teamId: string, role: 'write' | 'read') => {
    const updated = await runMutation(() => apiUpdateTeamAccess(tenant, workspace, project, teamId, role));
    setAccess(updated);
    await refetchEffective();
  }, [tenant, workspace, project, runMutation, refetchEffective]);

  const revokeTeam = useCallback(async (teamId: string) => {
    const updated = await runMutation(() => apiRevokeTeamAccess(tenant, workspace, project, teamId));
    setAccess(updated);
    await refetchEffective();
  }, [tenant, workspace, project, runMutation, refetchEffective]);

  const grantUser = useCallback(async (userId: string, role: Role) => {
    const updated = await runMutation(() => apiGrantUserAccess(tenant, workspace, project, userId, role));
    setAccess(updated);
    await refetchEffective();
  }, [tenant, workspace, project, runMutation, refetchEffective]);

  const updateUser = useCallback(async (userId: string, role: Role) => {
    const updated = await runMutation(() => apiUpdateUserAccess(tenant, workspace, project, userId, role));
    setAccess(updated);
    await refetchEffective();
  }, [tenant, workspace, project, runMutation, refetchEffective]);

  const revokeUser = useCallback(async (userId: string) => {
    const updated = await runMutation(() => apiRevokeUserAccess(tenant, workspace, project, userId));
    setAccess(updated);
    await refetchEffective();
  }, [tenant, workspace, project, runMutation, refetchEffective]);

  const value: ProjectAccessCtxValue = {
    access, effective, loading, saving, error, refresh,
    grantTeam, updateTeam, revokeTeam,
    grantUser, updateUser, revokeUser,
  };

  return (
    <ProjectAccessContext.Provider value={value}>
      {children}
    </ProjectAccessContext.Provider>
  );
}

export function useProjectAccess(): ProjectAccessCtxValue {
  const ctx = useContext(ProjectAccessContext);
  if (!ctx) throw new Error('useProjectAccess must be used within ProjectAccessProvider');
  return ctx;
}
