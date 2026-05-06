// Issues — runtime state, scoped per (tenant, workspace).
//
// **Slice 5 (2026-05-05)** — flipped from fixture-backed to API-backed. The
// provider fetches the workspace's issues from the BE on mount and exposes
// them via `useIssues()`. The pre-existing localStorage override layer
// (`bira:issue-overrides:v2:<tenant>:<workspace>`) stays — per the
// "planning gantt vs reality gantt" design call (see user memory
// `project_planning_vs_reality_gantt.md`), localStorage is the planning-
// gantt seed: ephemeral what-if state that doesn't write back to the BE.
// Reality-gantt writes (slice 6) will hit the API directly.
//
// Storage shape: `{ [issueKey]: Partial<Issue> }`. Only the fields the user
// has actually edited are stored; everything else falls through to the
// API base. Schema additions (new fields, new issues) show up immediately
// for users that already have an overrides blob.
//
// **v2 prefix** — slice 0 (2026-05-05) reshaped Issue: `id`→`key`,
// `project`→`projectId` (uuid), `assignee`→`assigneeUserId` (uuid|null).
// Old v1 blobs reference removed fields, so the storage key was bumped.
//
// Mounted inside `WorkspaceLayout` with `key={`${tenant}/${workspace}`}`,
// so navigating across pairs remounts the provider with a fresh fetch +
// the right storage key.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import type { Issue } from '../fixtures';
import {
  listWorkspaceIssues,
  getIssue as apiGetIssue,
  updateIssue as apiUpdateIssue,
  createIssue as apiCreateIssue,
  setIssueParent as apiSetIssueParent,
  addRelatesLink as apiAddRelatesLink,
  removeRelatesLink as apiRemoveRelatesLink,
  addDependencyLink as apiAddDependencyLink,
  removeDependencyLink as apiRemoveDependencyLink,
  type UpdateIssuePayload,
  type CreateIssuePayload,
} from '../api/issues';
import type { RawIssueAttachment } from '../api/adapters/issue.adapter';
import { useProjects } from './projects';
import { ApiError } from '../api/client';

type Patch = Partial<Issue>;

const storageKey = (tenant: string, workspace: string) =>
  `bira:issue-overrides:v2:${tenant}:${workspace}`;

function loadOverrides(key: string): Record<string, Patch> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, Patch>;
    }
  } catch {
    // ignore — corrupt blob, drop it.
  }
  return {};
}

/**
 * Result shape returned by every write mutation. Callers either render
 * the success or surface `message` inline next to the affected control.
 * `status` is the HTTP status from the BE when present — handy for
 * differentiating a 403 transition-guard from a 404 missing parent.
 */
export type MutationResult<T = Issue> =
  | { ok: true; issue: T }
  | { ok: false; message: string; status?: number };

/** Shape accepted by `patchIssue` — mirrors the BE PATCH body. */
export type IssuePatchInput = UpdateIssuePayload;
/** Shape accepted by `createIssueLive` — mirrors the BE POST body, plus a project slug. */
export interface CreateIssueLiveInput extends CreateIssuePayload {
  /** URL slug of the project to create under. Resolved to uuid by the BE. */
  projectSlug: string;
}

export interface IssuesCtxValue {
  /** API-backed issues with persisted overrides applied, in fetch order. */
  issues: Issue[];
  /** True only on the initial fetch — background `refresh()` does not toggle this. */
  loading: boolean;
  /** Error from the most recent fetch attempt. Cleared on the next successful fetch. */
  error: string | null;
  /** Lookup by key; returns the override-merged issue (or undefined). */
  getIssue: (key: string) => Issue | undefined;
  /**
   * Look up the cached description attachments for an issue (populated when
   * the detail endpoint has been hit). Empty / undefined for issues that
   * have only been seen via the list.
   */
  getDescriptionAttachments: (key: string) => RawIssueAttachment[] | undefined;
  /**
   * Stash the result of a detail fetch into the cache so the inspector can
   * cite expanded attachments without a re-fetch on subsequent renders.
   * Idempotent — overwrites any prior entry for the same key.
   */
  cacheDetail: (issue: Issue, attachments: RawIssueAttachment[]) => void;
  /** Background refetch (does not toggle `loading`). */
  refresh: () => Promise<void>;
  /**
   * **Planning-gantt write path.** Merges `patch` into the localStorage
   * override for `key` — never hits the BE. Used by the workspace-level
   * planning Gantt for ephemeral what-if drags. Persisted on the next tick.
   */
  updateIssue: (key: string, patch: Patch) => void;
  /**
   * **Reality write path (slice 6).** Optimistically updates the cache,
   * then PATCHes the BE. On error the optimistic write is rolled back and
   * the result carries the message. Status (403) for transition-guard
   * rejections; 400 for shape errors.
   */
  patchIssue: (key: string, patch: IssuePatchInput) => Promise<MutationResult>;
  /**
   * **Reality write path (slice 6).** POST a new issue. On success the
   * returned Issue (with BE-allocated `key` + uuid `id`) is inserted at
   * the head of the list. On failure the cache is untouched.
   */
  createIssueLive: (input: CreateIssueLiveInput) => Promise<MutationResult>;
  /**
   * **Reality write path (slice 6).** Set / clear an issue's parent.
   * Optimistically updates BOTH ends in the cache (the symmetric-storage
   * rule from v1-constraints): the child's `parent`, the old parent's
   * `children[]`, and the new parent's `children[]`. Rolls back on error.
   */
  setParent: (key: string, parentKey: string | null) => Promise<MutationResult>;
  /**
   * **Reality write path (slice 7).** Add a `relates` link between `key`
   * and `otherKey`. Symmetric — both ends' `relatedTo[]` arrays are
   * updated optimistically. Rolls back on failure.
   */
  addRelation: (key: string, otherKey: string) => Promise<MutationResult>;
  /**
   * **Reality write path (slice 7).** Remove a `relates` link between
   * `key` and `otherKey`. Touches both ends' `relatedTo[]` optimistically.
   */
  removeRelation: (key: string, otherKey: string) => Promise<MutationResult>;
  /**
   * **Reality write path (slice 7).** Add a `depends-on` link: `key`
   * depends on `blockerKey`. Optimistically appends `blockerKey` to
   * `key.dependsOn[]` and `key` to `blockerKey.dependedOnBy[]`. The BE
   * rejects cycles with HTTP 400 — surface the message via `MutationResult`.
   */
  addDependsOn: (key: string, blockerKey: string) => Promise<MutationResult>;
  /**
   * **Reality write path (slice 7).** Remove a `depends-on` link.
   * Optimistically scrubs `blockerKey` from `key.dependsOn[]` and `key`
   * from `blockerKey.dependedOnBy[]`. Callable from either end of the
   * link — pass the dependent's key as `key`, the blocker's as `blockerKey`.
   */
  removeDependsOn: (key: string, blockerKey: string) => Promise<MutationResult>;
  /** Drop all overrides for `key`, restoring the API value. */
  resetIssue: (key: string) => void;
  /** Drop every override in this workspace. */
  resetAll: () => void;
  /** True iff at least one override is in effect. */
  hasOverrides: boolean;
}

const IssuesContext = createContext<IssuesCtxValue | undefined>(undefined);

export function IssuesProvider({
  tenant, workspace, children,
}: { tenant: string; workspace: string; children: ReactNode }) {
  const overrideKey = storageKey(tenant, workspace);
  // `getProjectById` resolves an issue's uuid `projectId` → the BE-route slug.
  // Reads only — the IssuesProvider is mounted INSIDE ProjectsProvider in
  // App.tsx so the lookup is stable for the lifetime of this provider.
  const { getProjectById } = useProjects();

  const [baseIssues, setBaseIssues] = useState<Issue[]>([]);
  const [attachmentsByKey, setAttachmentsByKey] = useState<Record<string, RawIssueAttachment[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Patch>>(() => loadOverrides(overrideKey));

  // Used by mutation paths to look up the current cached issue without
  // re-deriving from the rendered list (which is recomputed every render).
  // Mutations need a snapshot before optimistic apply so a rollback can
  // restore the exact prior shape.
  const baseIssuesRef = useRef<Issue[]>(baseIssues);
  useEffect(() => { baseIssuesRef.current = baseIssues; }, [baseIssues]);

  // Persist overrides whenever they change. Distinct from the API fetch — a
  // failed fetch leaves the override blob alone.
  useEffect(() => {
    try {
      localStorage.setItem(overrideKey, JSON.stringify(overrides));
    } catch {
      // Quota / privacy mode — best-effort.
    }
  }, [overrideKey, overrides]);

  // Initial fetch. The `key={tenant/workspace}` on the provider in App.tsx
  // remounts the provider whenever those change, so we don't need to refetch
  // here on slug changes — the dependency list is intentionally minimal.
  useEffect(() => {
    if (!tenant || !workspace) {
      setBaseIssues([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listWorkspaceIssues(tenant, workspace)
      .then((items) => {
        if (cancelled) return;
        setBaseIssues(items);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setBaseIssues([]);
        setError(err instanceof Error ? err.message : 'Failed to load issues');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenant, workspace]);

  const refresh = useCallback(async () => {
    if (!tenant || !workspace) return;
    try {
      const items = await listWorkspaceIssues(tenant, workspace);
      setBaseIssues(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issues');
    }
  }, [tenant, workspace]);

  // Merge overrides on top of the API base. Same semantics as the prior
  // fixture-backed provider — only the fields a user has touched override
  // the source.
  const issues = useMemo(
    () => baseIssues.map((i) => {
      const o = overrides[i.key];
      return o ? { ...i, ...o } : i;
    }),
    [baseIssues, overrides],
  );

  const getIssue = useCallback(
    (k: string) => issues.find((i) => i.key === k),
    [issues],
  );

  const getDescriptionAttachments = useCallback(
    (k: string) => attachmentsByKey[k],
    [attachmentsByKey],
  );

  const cacheDetail = useCallback((issue: Issue, attachments: RawIssueAttachment[]) => {
    // Upsert the issue into the base list so subsequent list refreshes see
    // it AND the inspector keeps the expanded attachments alive across
    // re-renders. Attachments live in a sidecar map so a list refresh
    // (which doesn't include them) can't strip them.
    setBaseIssues((prev) => {
      const idx = prev.findIndex((i) => i.key === issue.key);
      if (idx === -1) return [...prev, issue];
      const next = [...prev];
      next[idx] = { ...prev[idx], ...issue };
      return next;
    });
    setAttachmentsByKey((prev) => ({ ...prev, [issue.key]: attachments }));
  }, []);

  const updateIssue = useCallback((k: string, patch: Patch) => {
    setOverrides((prev) => ({ ...prev, [k]: { ...(prev[k] ?? {}), ...patch } }));
  }, []);

  // ──────────────────────────────────────────────────────────────────────
  // Reality-write mutations (slice 6)
  // ──────────────────────────────────────────────────────────────────────
  //
  // These hit the BE directly. The cache is updated optimistically so the
  // UI reflects the change instantly; on failure the prior issue snapshot
  // is restored and a structured error is returned to the caller. Success
  // path replaces the optimistic row with the BE response so any
  // server-derived fields (updated, dependedOnBy, etc.) stay accurate.
  //
  // `bira:issue-overrides:v2:*` is intentionally NOT touched here — it's
  // the planning-gantt seed and stays orthogonal to reality writes.

  /**
   * Resolve an issue key → its project's URL slug. Returns undefined when
   * either the issue or its project isn't in cache; the caller surfaces a
   * structured error rather than silently failing.
   */
  const resolveProjectSlug = useCallback((key: string): string | undefined => {
    const cached = baseIssuesRef.current.find((i) => i.key === key);
    if (!cached) return undefined;
    return getProjectById(cached.projectId)?.slug;
  }, [getProjectById]);

  const errorMessage = (err: unknown): { message: string; status?: number } => {
    if (err instanceof ApiError) return { message: err.message, status: err.status };
    if (err instanceof Error) return { message: err.message };
    return { message: 'Unknown error' };
  };

  const patchIssue = useCallback(async (
    k: string, patch: IssuePatchInput,
  ): Promise<MutationResult> => {
    const projectSlug = resolveProjectSlug(k);
    if (!projectSlug) {
      return { ok: false, message: `Issue '${k}' not found in cache` };
    }
    // Snapshot for rollback. Strip undefineds out of `patch` since
    // {field: undefined} would still overwrite the cached value.
    const definedPatch: Partial<Issue> = {};
    for (const [pk, pv] of Object.entries(patch)) {
      if (pv !== undefined) (definedPatch as Record<string, unknown>)[pk] = pv;
    }
    const prevList = baseIssuesRef.current;
    const idx = prevList.findIndex((i) => i.key === k);
    if (idx === -1) return { ok: false, message: `Issue '${k}' not found in cache` };
    const prev = prevList[idx];
    // Optimistic apply.
    setBaseIssues((cur) => {
      const i = cur.findIndex((x) => x.key === k);
      if (i === -1) return cur;
      const next = [...cur];
      next[i] = { ...cur[i], ...definedPatch } as Issue;
      return next;
    });
    try {
      const updated = await apiUpdateIssue(tenant, workspace, projectSlug, k, patch);
      // Replace optimistic with BE response so any server-derived fields
      // (e.g. updated timestamp) become canonical.
      setBaseIssues((cur) => {
        const i = cur.findIndex((x) => x.key === k);
        if (i === -1) return [...cur, updated];
        const next = [...cur];
        next[i] = updated;
        return next;
      });
      return { ok: true, issue: updated };
    } catch (err) {
      // Rollback to the pre-mutation snapshot.
      setBaseIssues((cur) => {
        const i = cur.findIndex((x) => x.key === k);
        if (i === -1) return cur;
        const next = [...cur];
        next[i] = prev;
        return next;
      });
      return { ok: false, ...errorMessage(err) };
    }
  }, [tenant, workspace, resolveProjectSlug]);

  const createIssueLive = useCallback(async (
    input: CreateIssueLiveInput,
  ): Promise<MutationResult> => {
    const { projectSlug, ...payload } = input;
    try {
      const created = await apiCreateIssue(tenant, workspace, projectSlug, payload);
      // Insert into cache. Push to the end so list ordering matches
      // backend list ordering (BE seeds list by createdAt asc; inserting
      // at the end matches "latest creation, latest in the list").
      setBaseIssues((cur) => [...cur, created]);
      return { ok: true, issue: created };
    } catch (err) {
      return { ok: false, ...errorMessage(err) };
    }
  }, [tenant, workspace]);

  const setParent = useCallback(async (
    k: string, parentKey: string | null,
  ): Promise<MutationResult> => {
    const projectSlug = resolveProjectSlug(k);
    if (!projectSlug) {
      return { ok: false, message: `Issue '${k}' not found in cache` };
    }
    // Snapshot the FULL list — parent updates touch THREE rows (child,
    // old parent, new parent) and we want a clean rollback for all of
    // them on failure.
    const prevList = baseIssuesRef.current;
    const child = prevList.find((i) => i.key === k);
    if (!child) return { ok: false, message: `Issue '${k}' not found in cache` };
    const oldParentKey = child.parent ?? null;

    // Optimistic — update child's `parent`, scrub from old parent's
    // children[], add to new parent's children[]. v1-constraints requires
    // both ends of the parent/children relation stay in sync.
    setBaseIssues((cur) => cur.map((i) => {
      if (i.key === k) {
        const next = { ...i };
        if (parentKey === null) delete next.parent;
        else next.parent = parentKey;
        return next;
      }
      if (oldParentKey && i.key === oldParentKey) {
        const ch = (i.children ?? []).filter((c) => c !== k);
        const next = { ...i };
        if (ch.length === 0) delete next.children; else next.children = ch;
        return next;
      }
      if (parentKey && i.key === parentKey) {
        const existing = i.children ?? [];
        if (existing.includes(k)) return i;
        return { ...i, children: [...existing, k] };
      }
      return i;
    }));

    try {
      const updated = await apiSetIssueParent(tenant, workspace, projectSlug, k, parentKey);
      // Adopt the BE response for the child row — server is authoritative
      // on `parent` AND on any cascaded fields. Old/new parent rows keep
      // the optimistic children[] update; the BE doesn't return them on
      // this endpoint and a refresh() will reconcile if they drift.
      setBaseIssues((cur) => {
        const i = cur.findIndex((x) => x.key === k);
        if (i === -1) return [...cur, updated];
        const next = [...cur];
        next[i] = updated;
        return next;
      });
      return { ok: true, issue: updated };
    } catch (err) {
      // Roll all three rows back to the pre-mutation snapshot.
      setBaseIssues(() => prevList);
      return { ok: false, ...errorMessage(err) };
    }
  }, [tenant, workspace, resolveProjectSlug]);

  // ──────────────────────────────────────────────────────────────────────
  // Issue links — relates + depends-on (slice 7)
  // ──────────────────────────────────────────────────────────────────────
  //
  // Both link types are stored on BOTH ends per the v1 symmetric-storage
  // rule. Optimistic UI must update both rows so an inspector viewing
  // the OTHER end of a freshly-added link sees it instantly. The BE
  // returns the canonical `key`-end view; we adopt that for `key` and
  // keep the optimistic mirror on `otherKey` (a `refresh()` reconciles
  // any drift). Rollback on failure restores the FULL list snapshot so
  // both ends revert in lockstep.

  /**
   * Apply a per-issue mutator to the cache. The mutator returns the
   * next shape for matched rows (or the same row when no change applies).
   * We use this to scope updates to the two rows touched by a link
   * mutation without rebuilding the whole array conditionally.
   */
  const mapIssues = (
    mut: (i: Issue) => Issue,
  ) => setBaseIssues((cur) => cur.map(mut));

  const addRelation = useCallback(async (
    k: string, otherKey: string,
  ): Promise<MutationResult> => {
    if (k === otherKey) {
      return { ok: false, message: 'An issue cannot relate to itself' };
    }
    const projectSlug = resolveProjectSlug(k);
    if (!projectSlug) {
      return { ok: false, message: `Issue '${k}' not found in cache` };
    }
    const prevList = baseIssuesRef.current;

    // Optimistic — append to both ends' relatedTo[]. Idempotent: skip if
    // the entry is already present (the BE is also idempotent here).
    mapIssues((i) => {
      if (i.key === k) {
        const cur = i.relatedTo ?? [];
        if (cur.includes(otherKey)) return i;
        return { ...i, relatedTo: [...cur, otherKey] };
      }
      if (i.key === otherKey) {
        const cur = i.relatedTo ?? [];
        if (cur.includes(k)) return i;
        return { ...i, relatedTo: [...cur, k] };
      }
      return i;
    });

    try {
      const updated = await apiAddRelatesLink(tenant, workspace, projectSlug, k, otherKey);
      // Adopt the canonical `k`-end view; keep the optimistic mirror on
      // the other side (BE doesn't return it from this endpoint).
      setBaseIssues((cur) => {
        const i = cur.findIndex((x) => x.key === k);
        if (i === -1) return [...cur, updated];
        const next = [...cur];
        next[i] = updated;
        return next;
      });
      return { ok: true, issue: updated };
    } catch (err) {
      setBaseIssues(() => prevList);
      return { ok: false, ...errorMessage(err) };
    }
  }, [tenant, workspace, resolveProjectSlug]);

  const removeRelation = useCallback(async (
    k: string, otherKey: string,
  ): Promise<MutationResult> => {
    const projectSlug = resolveProjectSlug(k);
    if (!projectSlug) {
      return { ok: false, message: `Issue '${k}' not found in cache` };
    }
    const prevList = baseIssuesRef.current;

    // Optimistic — scrub both ends. Drop the field entirely when the array
    // would otherwise be empty so the FE shape stays narrow (matches how
    // the adapter only attaches non-empty relatedTo).
    mapIssues((i) => {
      if (i.key !== k && i.key !== otherKey) return i;
      const filterKey = i.key === k ? otherKey : k;
      const cur = i.relatedTo ?? [];
      if (!cur.includes(filterKey)) return i;
      const next = cur.filter((r) => r !== filterKey);
      const ni = { ...i };
      if (next.length === 0) delete ni.relatedTo; else ni.relatedTo = next;
      return ni;
    });

    try {
      const updated = await apiRemoveRelatesLink(tenant, workspace, projectSlug, k, otherKey);
      setBaseIssues((cur) => {
        const i = cur.findIndex((x) => x.key === k);
        if (i === -1) return [...cur, updated];
        const next = [...cur];
        next[i] = updated;
        return next;
      });
      return { ok: true, issue: updated };
    } catch (err) {
      setBaseIssues(() => prevList);
      return { ok: false, ...errorMessage(err) };
    }
  }, [tenant, workspace, resolveProjectSlug]);

  const addDependsOn = useCallback(async (
    k: string, blockerKey: string,
  ): Promise<MutationResult> => {
    if (k === blockerKey) {
      return { ok: false, message: 'A task cannot depend on itself' };
    }
    const projectSlug = resolveProjectSlug(k);
    if (!projectSlug) {
      return { ok: false, message: `Issue '${k}' not found in cache` };
    }
    const prevList = baseIssuesRef.current;

    // Optimistic — `k.dependsOn` gains `blockerKey`; `blockerKey.dependedOnBy`
    // gains `k`. Symmetric storage: edits both ends.
    mapIssues((i) => {
      if (i.key === k) {
        const cur = i.dependsOn ?? [];
        if (cur.includes(blockerKey)) return i;
        return { ...i, dependsOn: [...cur, blockerKey] };
      }
      if (i.key === blockerKey) {
        const cur = i.dependedOnBy ?? [];
        if (cur.includes(k)) return i;
        return { ...i, dependedOnBy: [...cur, k] };
      }
      return i;
    });

    try {
      const updated = await apiAddDependencyLink(tenant, workspace, projectSlug, k, blockerKey);
      setBaseIssues((cur) => {
        const i = cur.findIndex((x) => x.key === k);
        if (i === -1) return [...cur, updated];
        const next = [...cur];
        next[i] = updated;
        return next;
      });
      return { ok: true, issue: updated };
    } catch (err) {
      // Cycle / Task-only / cross-project rejections all roll the full
      // list back. The picker pre-filters most cycles client-side, but a
      // race (someone else's edit landed first) can still surface the
      // BE message here.
      setBaseIssues(() => prevList);
      return { ok: false, ...errorMessage(err) };
    }
  }, [tenant, workspace, resolveProjectSlug]);

  const removeDependsOn = useCallback(async (
    k: string, blockerKey: string,
  ): Promise<MutationResult> => {
    const projectSlug = resolveProjectSlug(k);
    if (!projectSlug) {
      return { ok: false, message: `Issue '${k}' not found in cache` };
    }
    const prevList = baseIssuesRef.current;

    mapIssues((i) => {
      if (i.key === k) {
        const cur = i.dependsOn ?? [];
        if (!cur.includes(blockerKey)) return i;
        const next = cur.filter((d) => d !== blockerKey);
        const ni = { ...i };
        if (next.length === 0) delete ni.dependsOn; else ni.dependsOn = next;
        return ni;
      }
      if (i.key === blockerKey) {
        const cur = i.dependedOnBy ?? [];
        if (!cur.includes(k)) return i;
        const next = cur.filter((d) => d !== k);
        const ni = { ...i };
        if (next.length === 0) delete ni.dependedOnBy; else ni.dependedOnBy = next;
        return ni;
      }
      return i;
    });

    try {
      const updated = await apiRemoveDependencyLink(tenant, workspace, projectSlug, k, blockerKey);
      setBaseIssues((cur) => {
        const i = cur.findIndex((x) => x.key === k);
        if (i === -1) return [...cur, updated];
        const next = [...cur];
        next[i] = updated;
        return next;
      });
      return { ok: true, issue: updated };
    } catch (err) {
      setBaseIssues(() => prevList);
      return { ok: false, ...errorMessage(err) };
    }
  }, [tenant, workspace, resolveProjectSlug]);

  const resetIssue = useCallback((k: string) => {
    setOverrides((prev) => {
      if (!(k in prev)) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  }, []);

  const resetAll = useCallback(() => setOverrides({}), []);

  const value: IssuesCtxValue = {
    issues,
    loading,
    error,
    getIssue,
    getDescriptionAttachments,
    cacheDetail,
    refresh,
    updateIssue,
    patchIssue,
    createIssueLive,
    setParent,
    addRelation,
    removeRelation,
    addDependsOn,
    removeDependsOn,
    resetIssue,
    resetAll,
    hasOverrides: Object.keys(overrides).length > 0,
  };

  return <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>;
}

export function useIssues(): IssuesCtxValue {
  const ctx = useContext(IssuesContext);
  if (!ctx) throw new Error('useIssues must be used within IssuesProvider');
  return ctx;
}

// Re-exported for callers that want to do a one-off detail fetch without
// going through the provider (e.g. the issue-detail screen handling a deep
// link before the workspace list has loaded).
export { apiGetIssue as fetchIssueDetail };
