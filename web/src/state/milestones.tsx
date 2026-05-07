// Project milestones — runtime state, scoped per (tenant, workspace).
//
// API-backed. The provider fetches the workspace's milestones from the BE
// on mount and exposes them via `useMilestones()`. CRUD methods PATCH/POST/
// DELETE the BE and update local state from the response on success;
// failures surface as `MutationResult` so callers can render inline errors.
//
// **localStorage cleanup**: every successful fetch removes the legacy
// `bira:milestones:<tenant>:<workspace>` blob — this provider used to
// persist there before the BE phase landed. Idempotent; once cleared it
// stays cleared.
//
// **Project slug resolution**: BE write endpoints are project-scoped and
// take the project's URL slug. The FE has uuids, so we resolve via
// `useProjects().getProjectById(projectId)?.slug` inside each mutation.
// The provider is mounted INSIDE `ProjectsProvider` in `App.tsx`, so the
// lookup is safe for the lifetime of this provider.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import type { Milestone } from '../fixtures';
import {
  listWorkspaceMilestones,
  createMilestone as apiCreateMilestone,
  updateMilestone as apiUpdateMilestone,
  deleteMilestone as apiDeleteMilestone,
} from '../api/milestones';
import { ApiError } from '../api/client';
import { useProjects } from './projects';

const LEGACY_STORAGE_KEY_PREFIX = 'bira:milestones';

function legacyStorageKey(tenant: string, workspace: string): string {
  return `${LEGACY_STORAGE_KEY_PREFIX}:${tenant}:${workspace}`;
}

/** Fields the create form supplies. `projectId` is the FE-side uuid. */
export interface AddMilestoneInput {
  projectId: string;
  name: string;
  description?: string;
  date: string;
}

/** Patch shape accepted by `updateMilestone`. */
export interface UpdateMilestonePatch {
  name?: string;
  description?: string | null;
  date?: string;
}

/** Result of a create / update mutation. */
export type MilestoneMutationResult =
  | { ok: true; milestone: Milestone }
  | { ok: false; message: string; status?: number };

/** Result of a delete mutation. */
export type MilestoneDeleteResult =
  | { ok: true }
  | { ok: false; message: string; status?: number };

export interface MilestonesCtxValue {
  milestones: Milestone[];
  /** True only on the initial fetch — background `refresh()` does not toggle this. */
  loading: boolean;
  /** Error from the most recent fetch attempt. Cleared on the next successful fetch. */
  error: string | null;
  /** Background refetch (does not toggle `loading`). */
  refresh: () => Promise<void>;
  /** All milestones for `projectId`, sorted by `date` ascending (soonest first). */
  milestonesForProject: (projectId: string) => Milestone[];
  getMilestone: (id: string) => Milestone | undefined;
  addMilestone: (input: AddMilestoneInput) => Promise<MilestoneMutationResult>;
  updateMilestone: (id: string, patch: UpdateMilestonePatch) => Promise<MilestoneMutationResult>;
  removeMilestone: (id: string) => Promise<MilestoneDeleteResult>;
}

const MilestonesContext = createContext<MilestonesCtxValue | undefined>(undefined);

function errorMessage(err: unknown): { message: string; status?: number } {
  if (err instanceof ApiError) return { message: err.message, status: err.status };
  if (err instanceof Error) return { message: err.message };
  return { message: 'Network error' };
}

export function MilestonesProvider({
  tenant, workspace, children,
}: {
  tenant: string; workspace: string; children: ReactNode;
}) {
  const { getProjectById } = useProjects();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial fetch. The `key={tenant/workspace}` on the provider in App.tsx
  // remounts whenever the pair changes, so we don't need to refetch on slug
  // changes here — the dependency list is intentionally minimal.
  useEffect(() => {
    if (!tenant || !workspace) {
      setMilestones([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listWorkspaceMilestones(tenant, workspace)
      .then((items) => {
        if (cancelled) return;
        setMilestones(items);
        setError(null);
        // Drop the legacy localStorage blob — silent + idempotent.
        try {
          localStorage.removeItem(legacyStorageKey(tenant, workspace));
        } catch {
          /* ignore quota / privacy mode */
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setMilestones([]);
        setError(err instanceof Error ? err.message : 'Failed to load milestones');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenant, workspace]);

  const refresh = useCallback(async () => {
    if (!tenant || !workspace) return;
    try {
      const items = await listWorkspaceMilestones(tenant, workspace);
      setMilestones(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load milestones');
    }
  }, [tenant, workspace]);

  const milestonesForProject = useCallback(
    (projectId: string) =>
      milestones
        .filter((m) => m.projectId === projectId)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date)),
    [milestones],
  );

  const getMilestone = useCallback(
    (id: string) => milestones.find((m) => m.id === id),
    [milestones],
  );

  const addMilestone = useCallback(async (
    input: AddMilestoneInput,
  ): Promise<MilestoneMutationResult> => {
    const projectSlug = getProjectById(input.projectId)?.slug;
    if (!projectSlug) {
      return { ok: false, message: 'Project not found' };
    }
    const trimmedDescription = input.description?.trim();
    try {
      const created = await apiCreateMilestone(tenant, workspace, projectSlug, {
        name: input.name,
        // Empty string → null so the BE clears the column rather than
        // storing whitespace. Undefined → omit the field entirely.
        description: trimmedDescription ? trimmedDescription : null,
        date: input.date,
      });
      setMilestones((prev) => [created, ...prev]);
      return { ok: true, milestone: created };
    } catch (err) {
      return { ok: false, ...errorMessage(err) };
    }
  }, [tenant, workspace, getProjectById]);

  const updateMilestone = useCallback(async (
    id: string, patch: UpdateMilestonePatch,
  ): Promise<MilestoneMutationResult> => {
    const existing = milestones.find((m) => m.id === id);
    if (!existing) {
      return { ok: false, message: `Milestone '${id}' not found in cache` };
    }
    const projectSlug = getProjectById(existing.projectId)?.slug;
    if (!projectSlug) {
      return { ok: false, message: 'Project not found' };
    }
    try {
      const updated = await apiUpdateMilestone(tenant, workspace, projectSlug, id, patch);
      setMilestones((prev) => prev.map((m) => (m.id === id ? updated : m)));
      return { ok: true, milestone: updated };
    } catch (err) {
      return { ok: false, ...errorMessage(err) };
    }
  }, [tenant, workspace, milestones, getProjectById]);

  const removeMilestone = useCallback(async (
    id: string,
  ): Promise<MilestoneDeleteResult> => {
    const existing = milestones.find((m) => m.id === id);
    if (!existing) {
      return { ok: false, message: `Milestone '${id}' not found in cache` };
    }
    const projectSlug = getProjectById(existing.projectId)?.slug;
    if (!projectSlug) {
      return { ok: false, message: 'Project not found' };
    }
    try {
      await apiDeleteMilestone(tenant, workspace, projectSlug, id);
      setMilestones((prev) => prev.filter((m) => m.id !== id));
      return { ok: true };
    } catch (err) {
      return { ok: false, ...errorMessage(err) };
    }
  }, [tenant, workspace, milestones, getProjectById]);

  const value = useMemo<MilestonesCtxValue>(
    () => ({
      milestones,
      loading,
      error,
      refresh,
      milestonesForProject,
      getMilestone,
      addMilestone,
      updateMilestone,
      removeMilestone,
    }),
    [milestones, loading, error, refresh, milestonesForProject, getMilestone, addMilestone, updateMilestone, removeMilestone],
  );

  return <MilestonesContext.Provider value={value}>{children}</MilestonesContext.Provider>;
}

export function useMilestones(): MilestonesCtxValue {
  const ctx = useContext(MilestonesContext);
  if (!ctx) throw new Error('useMilestones must be used within MilestonesProvider');
  return ctx;
}
