// Planner — workspace-level "what-if" scenario state, scoped per
// (tenant, workspace).
//
// **Slice 2 (2026-05-06)** — introduces the PlannerProvider. The Planner
// is a sandboxed view at `/:tenant/:workspace/planner` that lets the user
// reorder priority, disable Epics, override assignees, and pin dates —
// all without touching the BE or the planning-gantt overrides blob
// (`bira:issue-overrides:v2`). Per
// `memory/project_planning_vs_reality_gantt.md` the planner is a separate
// product from the planning gantt: distinct persistence key, distinct
// component (slice 4), distinct route.
//
// Persistence: `bira:planner:<tenant>:<workspace>` — full PlannerState
// blob. On corrupt parse we drop and re-default; on quota / privacy mode
// we silently swallow (best-effort, mirrors IssuesProvider).
//
// Mounted inside `WorkspaceLayout` (App.tsx) with
// `key={`${tenant}/${workspace}`}`, so navigating across pairs remounts
// the provider with a fresh load + the right storage key.
//
// **Team-on-Issue slice 4 (2026-05-07)** — `plan.teamAttachments` was
// removed. Team picks are organisational decisions that should stick, so
// the planner team picker now writes through to the BE via
// `useIssues().patchIssue({ teamId })` instead of into plan state. The
// scheduler reads `issue.teamId` directly. Legacy localStorage blobs
// from before this slice may still carry a `teamAttachments` object — the
// load path silently ignores it (no crash, no console warning).
//
// This file exposes mutators for *every* slice of state (priority,
// disabled, assigneeOverrides, pinnedDates, memberLeaves) so the
// planner gantt can wire directly without re-touching this file. The
// mutators are tiny — immutable updates to the relevant slice — but
// having them all named here keeps the FE state surface coherent.
//
// **Universal-disable rename (2026-05-07)** — `disabledEpics` →
// `disabled`. Originally only Epic rows could be toggled OFF in the
// plan; we generalised to "any issue type" so a Story or Task can be
// excluded too. The scheduler now drops a leaf if it OR any ancestor
// is in `plan.disabled`. The persistence parse falls back to a legacy
// `disabledEpics` array when the new `disabled` field isn't present,
// so older blobs migrate silently on the next write.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';

export interface PlannerWindow {
  /** ISO YYYY-MM-DD, inclusive lower bound. */
  start: string;
  /** ISO YYYY-MM-DD, inclusive upper bound. */
  end: string;
}

/** Gantt y-axis grouping mode. `'hierarchy'` is the default — the gantt
 *  renders a flattened Epic → Story → Task/Bug tree ordered by priority.
 *  `'assignee'` (slice 10, 2026-05-07) buckets leaf Tasks/Bugs by their
 *  *resolved* user (override → BE assignee → team-greedy pick) and drops
 *  containers entirely; an "Unscheduled" bucket pinned at the bottom
 *  collects leaves the scheduler couldn't place. */
export type PlannerGanttGroupBy = 'hierarchy' | 'assignee';

export interface PlannerState {
  /** Ordered issue keys defining y-axis priority. Items not listed
   *  fall back to natural order at the tail. */
  priority: string[];
  /** Issue keys toggled OFF in this scenario. The scheduler drops a
   *  leaf if its key OR any ancestor's key is in this list, regardless
   *  of issue type. (Was `disabledEpics: string[]` pre-2026-05-07.) */
  disabled: string[];
  /** Plan-only assignee overrides keyed by issue key. UUID or null
   *  (cleared = fall back to BE assignee). */
  assigneeOverrides: Record<string, string | null>;
  /** Plan-only date pins. Greedy scheduler treats these as fixed. */
  pinnedDates: Record<string, { startDate: string; endDate: string }>;
  /** Visible time window (ISO YYYY-MM-DD). User-adjustable. */
  window: PlannerWindow;
  /** Plan-only per-member leave dates (ISO YYYY-MM-DD). The greedy
   *  scheduler treats these as unavailable working days for that
   *  member; the workload heatmap renders them as black cells. Keyed
   *  by user UUID. Slice 9 (2026-05-07). */
  memberLeaves: Record<string, string[]>;
  /** Gantt y-axis grouping mode. Slice 10 (2026-05-07). Defaults to
   *  `'hierarchy'`. Persisted so the user's pivot choice sticks across
   *  reloads. Legacy blobs without this field load cleanly via the
   *  defensive parse (defaults to `'hierarchy'`). */
  ganttGroupBy: PlannerGanttGroupBy;
}

export interface PlannerCtxValue {
  plan: PlannerState;
  /** Replace the time window. */
  setWindow: (window: PlannerWindow) => void;
  /** Wholesale reset — clears the localStorage key and reverts to defaults. */
  reset: () => void;
  /** True iff any field differs from the default state. Used to enable
   *  the Reset button only when there is something to reset. */
  hasOverrides: boolean;
  /** Mutators slices 4-7 will need. Each updates the matching slice of
   *  state. Immutable — pass new arrays / objects. */
  setPriority: (priority: string[]) => void;
  /** Toggle an issue key in/out of the disabled set. Generalised from
   *  Epic-only to "any issue type" on 2026-05-07. */
  toggleDisabled: (issueKey: string) => void;
  setAssigneeOverride: (issueKey: string, userId: string | null) => void;
  clearAssigneeOverride: (issueKey: string) => void;
  setPinnedDates: (issueKey: string, dates: { startDate: string; endDate: string }) => void;
  clearPinnedDates: (issueKey: string) => void;
  /** Toggle a single (member, day). If the day is in that member's
   *  leave list, remove it; otherwise add it. Slice 9 (2026-05-07). */
  toggleMemberLeave: (userId: string, iso: string) => void;
  /** Drop all leave entries for a member. */
  clearMemberLeaves: (userId: string) => void;
  /** Slice 10 (2026-05-07) — switch the gantt y-axis grouping mode.
   *  Persisted in the same blob as the rest of plan state. */
  setGanttGroupBy: (mode: PlannerGanttGroupBy) => void;
}

const storageKey = (tenant: string, workspace: string) =>
  `bira:planner:${tenant}:${workspace}`;

/** Format a Date as ISO YYYY-MM-DD using local clock — we never want a
 *  UTC slip to push the bound a day off. Mirrors helper logic used in
 *  fixtures.ts (e.g. addWorkingDays returns local-ISO dates). */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Default window: today − 1 month → today + 2 months. Slice 2 uses this
 *  when no blob exists AND as the basis for "is this the default window?"
 *  comparison driving the Reset button's enabled state. */
function defaultWindow(): PlannerWindow {
  const today = new Date();
  const start = new Date(today);
  start.setMonth(start.getMonth() - 1);
  const end = new Date(today);
  end.setMonth(end.getMonth() + 2);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

function defaultState(): PlannerState {
  return {
    priority: [],
    disabled: [],
    assigneeOverrides: {},
    pinnedDates: {},
    window: defaultWindow(),
    memberLeaves: {},
    ganttGroupBy: 'hierarchy',
  };
}

/** Defensive parse — same shape as IssuesProvider.loadOverrides: any
 *  shape mismatch drops the blob and returns defaults. */
function loadPlanner(key: string): PlannerState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaultState();
    }
    const obj = parsed as Record<string, unknown>;
    const priority = Array.isArray(obj.priority) ? (obj.priority as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    // Universal-disable rename (2026-05-07): the field is now `disabled`.
    // Pre-rename blobs carry `disabledEpics`; fall through to that when the
    // new field is absent. On next write the blob is rewritten under
    // `disabled`, silently migrating the user.
    const fresh = Array.isArray(obj.disabled) ? (obj.disabled as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    const legacy = Array.isArray(obj.disabledEpics) ? (obj.disabledEpics as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    const disabled = fresh.length > 0 ? fresh : legacy;
    const assigneeOverrides = (obj.assigneeOverrides && typeof obj.assigneeOverrides === 'object' && !Array.isArray(obj.assigneeOverrides))
      ? (obj.assigneeOverrides as Record<string, string | null>)
      : {};
    // Team-on-Issue slice 4 (2026-05-07) — `teamAttachments` was removed
    // from PlannerState. Pre-slice blobs may still carry the field; we
    // silently drop it (no crash, no console warning) and let team picks
    // flow through `Issue.teamId` instead.
    const pinnedDates = (obj.pinnedDates && typeof obj.pinnedDates === 'object' && !Array.isArray(obj.pinnedDates))
      ? (obj.pinnedDates as Record<string, { startDate: string; endDate: string }>)
      : {};
    const winRaw = obj.window as { start?: unknown; end?: unknown } | undefined;
    const window = (winRaw && typeof winRaw.start === 'string' && typeof winRaw.end === 'string')
      ? { start: winRaw.start, end: winRaw.end }
      : defaultWindow();
    // Slice 9: per-member leave map. Object of userId → string[]; coerce
    // each entry, drop non-string day values defensively. Pre-slice-9
    // blobs simply lack the field and fall through to {}.
    const leavesRaw = obj.memberLeaves;
    const memberLeaves: Record<string, string[]> = {};
    if (leavesRaw && typeof leavesRaw === 'object' && !Array.isArray(leavesRaw)) {
      for (const [userId, days] of Object.entries(leavesRaw as Record<string, unknown>)) {
        if (typeof userId !== 'string') continue;
        if (!Array.isArray(days)) continue;
        const cleaned = (days as unknown[]).filter((x): x is string => typeof x === 'string');
        if (cleaned.length > 0) memberLeaves[userId] = cleaned;
      }
    }
    // Slice 10 (2026-05-07) — defensive parse for the gantt grouping
    // mode. Legacy blobs without this field default to 'hierarchy'; any
    // unrecognised value also falls back to the default rather than
    // crashing the planner with an unsupported mode.
    const ganttGroupBy: PlannerGanttGroupBy = obj.ganttGroupBy === 'assignee'
      ? 'assignee'
      : 'hierarchy';
    return {
      priority, disabled, assigneeOverrides,
      pinnedDates, window, memberLeaves, ganttGroupBy,
    };
  } catch {
    return defaultState();
  }
}

const PlannerContext = createContext<PlannerCtxValue | undefined>(undefined);

export function PlannerProvider({
  tenant, workspace, children,
}: { tenant: string; workspace: string; children: ReactNode }) {
  const key = storageKey(tenant, workspace);
  const [plan, setPlan] = useState<PlannerState>(() => loadPlanner(key));

  // Persist on every state change. Distinct from the API fetch in
  // IssuesProvider; here there is no API — localStorage IS the source.
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(plan));
    } catch {
      // Quota / privacy mode — best-effort.
    }
  }, [key, plan]);

  // Compare against a freshly-computed default window to decide
  // hasOverrides. The default window depends on `today`, so it shifts
  // each day — but for the Reset button the only useful question is
  // "did the user pick something other than the default at the time
  // they're looking at this page right now". Recomputing on each render
  // is cheap (a couple of Date allocations).
  const hasOverrides = useMemo(() => {
    if (plan.priority.length > 0) return true;
    if (plan.disabled.length > 0) return true;
    if (Object.keys(plan.assigneeOverrides).length > 0) return true;
    if (Object.keys(plan.pinnedDates).length > 0) return true;
    // Slice 9: any per-member leave entry counts as an override too —
    // Reset must offer to wipe them along with the rest.
    for (const days of Object.values(plan.memberLeaves)) {
      if (days.length > 0) return true;
    }
    // Slice 10: a non-default ganttGroupBy is also an override — the
    // Reset button should restore it along with the rest.
    if (plan.ganttGroupBy !== 'hierarchy') return true;
    const dw = defaultWindow();
    if (plan.window.start !== dw.start || plan.window.end !== dw.end) return true;
    return false;
  }, [plan]);

  const setWindow = useCallback((window: PlannerWindow) => {
    setPlan((prev) => ({ ...prev, window }));
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      // best-effort
    }
    setPlan(defaultState());
  }, [key]);

  const setPriority = useCallback((priority: string[]) => {
    setPlan((prev) => ({ ...prev, priority }));
  }, []);

  const toggleDisabled = useCallback((issueKey: string) => {
    setPlan((prev) => {
      const has = prev.disabled.includes(issueKey);
      const next = has
        ? prev.disabled.filter((k) => k !== issueKey)
        : [...prev.disabled, issueKey];
      return { ...prev, disabled: next };
    });
  }, []);

  const setAssigneeOverride = useCallback((issueKey: string, userId: string | null) => {
    setPlan((prev) => ({
      ...prev,
      assigneeOverrides: { ...prev.assigneeOverrides, [issueKey]: userId },
    }));
  }, []);

  const clearAssigneeOverride = useCallback((issueKey: string) => {
    setPlan((prev) => {
      if (!(issueKey in prev.assigneeOverrides)) return prev;
      const next = { ...prev.assigneeOverrides };
      delete next[issueKey];
      return { ...prev, assigneeOverrides: next };
    });
  }, []);

  const setPinnedDates = useCallback((issueKey: string, dates: { startDate: string; endDate: string }) => {
    setPlan((prev) => ({
      ...prev,
      pinnedDates: { ...prev.pinnedDates, [issueKey]: dates },
    }));
  }, []);

  const clearPinnedDates = useCallback((issueKey: string) => {
    setPlan((prev) => {
      if (!(issueKey in prev.pinnedDates)) return prev;
      const next = { ...prev.pinnedDates };
      delete next[issueKey];
      return { ...prev, pinnedDates: next };
    });
  }, []);

  // Slice 9 — per-member leave. Toggle a single (member, day): if the
  // day is in the member's leave list, remove it; otherwise add it.
  // Empty arrays are pruned out of the map so `hasOverrides` doesn't
  // light up on a member who toggled a day on then off.
  const toggleMemberLeave = useCallback((userId: string, iso: string) => {
    setPlan((prev) => {
      const cur = prev.memberLeaves[userId] ?? [];
      const has = cur.includes(iso);
      const nextDays = has ? cur.filter((d) => d !== iso) : [...cur, iso];
      const nextMap = { ...prev.memberLeaves };
      if (nextDays.length === 0) {
        delete nextMap[userId];
      } else {
        nextMap[userId] = nextDays;
      }
      return { ...prev, memberLeaves: nextMap };
    });
  }, []);

  const clearMemberLeaves = useCallback((userId: string) => {
    setPlan((prev) => {
      if (!(userId in prev.memberLeaves)) return prev;
      const next = { ...prev.memberLeaves };
      delete next[userId];
      return { ...prev, memberLeaves: next };
    });
  }, []);

  // Slice 10 (2026-05-07) — gantt y-axis grouping mode mutator. No-op if
  // the new value matches the current one so we don't churn React or
  // localStorage on idle clicks.
  const setGanttGroupBy = useCallback((mode: PlannerGanttGroupBy) => {
    setPlan((prev) => (prev.ganttGroupBy === mode ? prev : { ...prev, ganttGroupBy: mode }));
  }, []);

  const value: PlannerCtxValue = {
    plan,
    setWindow,
    reset,
    hasOverrides,
    setPriority,
    toggleDisabled,
    setAssigneeOverride,
    clearAssigneeOverride,
    setPinnedDates,
    clearPinnedDates,
    toggleMemberLeave,
    clearMemberLeaves,
    setGanttGroupBy,
  };

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function usePlanner(): PlannerCtxValue {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error('usePlanner must be used within PlannerProvider');
  return ctx;
}

/** Exported for tests / debug — the canonical default window (today−1mo
 *  → today+2mo). Useful for the screen layer that wants to label a preset
 *  as "active" when it matches the current plan. */
export { defaultWindow, toIsoDate };
