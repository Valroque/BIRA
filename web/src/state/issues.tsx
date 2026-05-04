// Issue overrides — runtime state, scoped per (tenant, workspace).
//
// Holds patches against the static `ISSUES` fixture and persists them to
// localStorage so user edits (gantt drag, gantt assignee picker, …) survive
// a refresh without standing up a real backend.
//
// Storage shape: `{ [issueId]: Partial<Issue> }`. Only the fields the user
// has actually edited are stored; everything else falls through to the
// fixture. That keeps the blob small AND means schema additions to the
// fixture (new fields, new seed issues) show up immediately for users that
// already have an overrides blob.
//
// Mounted inside `WorkspaceLayout` with `key={`${tenant}/${workspace}`}`,
// so navigating across pairs remounts the provider with the right storage
// key.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { ISSUES, type Issue } from '../fixtures';

type Patch = Partial<Issue>;

const storageKey = (tenant: string, workspace: string) =>
  `bira:issue-overrides:${tenant}:${workspace}`;

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

export interface IssuesCtxValue {
  /** Fixture issues with persisted overrides applied, in fixture order. */
  issues: Issue[];
  /** Lookup by id; returns the override-merged issue (or undefined). */
  getIssue: (id: string) => Issue | undefined;
  /** Merge `patch` into the override for `id`. Persisted on the next tick. */
  updateIssue: (id: string, patch: Patch) => void;
  /** Drop all overrides for `id`, restoring the fixture value. */
  resetIssue: (id: string) => void;
  /** Drop every override in this workspace. */
  resetAll: () => void;
  /** True iff at least one override is in effect. */
  hasOverrides: boolean;
}

const IssuesContext = createContext<IssuesCtxValue | undefined>(undefined);

export function IssuesProvider({
  tenant, workspace, children,
}: { tenant: string; workspace: string; children: ReactNode }) {
  const key = storageKey(tenant, workspace);
  const [overrides, setOverrides] = useState<Record<string, Patch>>(() => loadOverrides(key));

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(overrides));
    } catch {
      // Quota / privacy mode — best-effort.
    }
  }, [key, overrides]);

  const issues = useMemo(
    () => ISSUES.map((i) => {
      const o = overrides[i.id];
      return o ? { ...i, ...o } : i;
    }),
    [overrides],
  );

  const getIssue = useCallback(
    (id: string) => issues.find((i) => i.id === id),
    [issues],
  );

  const updateIssue = useCallback((id: string, patch: Patch) => {
    setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  }, []);

  const resetIssue = useCallback((id: string) => {
    setOverrides((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const resetAll = useCallback(() => setOverrides({}), []);

  const value: IssuesCtxValue = {
    issues,
    getIssue,
    updateIssue,
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
