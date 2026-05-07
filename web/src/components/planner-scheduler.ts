// Planner — pure greedy scheduler.
//
// Slice 3 (2026-05-06). This module is intentionally framework-free: no
// React, no DOM, no `Date.now()`, no `localStorage`, no `fetch`. It's a
// single pure function `scheduleIssues(...)` that slice 4 will call from
// a `useMemo` inside the planner screen, feeding it issues from
// `useIssues()`, plan state from `usePlanner()`, and team rosters from
// `useTeams()`. Output drives bar placement on the planner gantt.
//
// **Team-on-Issue slice 4 (2026-05-07)** — the scheduler now reads
// `issue.teamId` (UUID) directly instead of `plan.teamAttachments[key]`
// (slug). Callers feed it `teamMembersByUuid` (UUID-keyed map) sourced
// from `useTeams().teams` — keeping the scheduler in UUID-land like the
// rest of the FE.
//
// Why pure? The planner is the FE-only "what-if" sandbox per
// `memory/project_planning_vs_reality_gantt.md` — it must reflow on
// every plan-state change without round-tripping the BE, and the
// scheduler must be testable in isolation. Same input → same output;
// `today` is passed in so a unit test can fake the clock.
//
// What it does (high level):
//   1. Filter to leaves (Tasks/Bugs). Stories/Epics derive from leaves
//      at render time.
//   2. Drop leaves whose key OR any ancestor is in `plan.disabled` —
//      Universal-disable (2026-05-07) generalised this from "Epic only"
//      to "any issue type". Excluded leaves are surfaced via
//      `excludedDueToDisabled` so the gantt can grey them out and flag
//      cross-subtree dependents.
//   3. Partition into started (in-flight today, frozen) / pinned
//      (`plan.pinnedDates`, frozen) / greedy (everything else).
//   4. Pre-occupy each member's working-day ledger with frozen bars.
//   5. Walk greedy issues in priority order. For each: compute the
//      effective assignee (or a candidate set from the attached team),
//      respect dependsOn predecessors finishing, and place the bar on
//      the earliest free working day window for the chosen member.
//
// Hierarchy / link rules ported from `web/src/fixtures.ts` and
// `.claude/rules/v1-constraints.md`:
//   - Stories/Epics carry no schedule of their own — never placed here.
//   - `dependsOn` is Task-only (the BE enforces this). The scheduler
//     defends against a corrupt blob by detecting cycles and bailing
//     with `'cycle'`.
//   - Working week is Mon-Fri minus `HOLIDAYS`. All math goes through
//     the helpers in `fixtures.ts` — no parallel calendar logic.

import {
  IDEAL_POINTS_PER_DAY,
  addWorkingDays,
  isWorkingDay,
  workingDaysBetween,
  type Issue,
} from '../fixtures';
import type { PlannerState } from '../state/planner';

/** A team-member identifier as returned by `useTeams()` rosters. We use
 *  user UUIDs end-to-end so the scheduler can sit alongside the rest of
 *  the FE UUID identity model. */
export type UserId = string;

export interface ScheduledBar {
  /** ISO YYYY-MM-DD inclusive. */
  startDate: string;
  endDate: string;
  /** UUID of the member the scheduler placed this on. Empty string is
   *  not allowed — `null` means "no assignee resolvable" and the issue
   *  will appear in `unscheduled` instead. */
  assigneeUserId: UserId | null;
  reason: 'started' | 'pinned' | 'greedy';
}

export type UnscheduledReason =
  | 'no-team-or-assignee'      // Task lacks both an assignee and a team
  | 'no-effort'                // estimate missing or 0 — can't size a bar
  | 'team-empty'               // team attached but it has no active members
  | 'blocked-by-disabled-epic' // depends on a Task that wasn't placed (Universal-disable: now any disabled issue/ancestor)
  | 'cycle';                   // dependsOn graph contains a cycle (defensive)

export interface SchedulerInput {
  /** All workspace issues (not pre-filtered). The scheduler ignores
   *  Stories / Epics — it only places leaves. */
  issues: Issue[];
  /** Plan state. Drives priority order, disabled epics, assignee /
   *  team overrides, pinned dates. */
  plan: PlannerState;
  /** Today as ISO YYYY-MM-DD. Tomorrow+ greedy placements floor here.
   *  Pass it in (don't read clock inside) so the function stays pure
   *  and testable. */
  today: string;
  /** Active member UUIDs per team UUID. Sourced from `useTeams()`'s
   *  rosters in the caller. The scheduler picks any active member of
   *  the issue's `teamId` when an assignee is missing. UUID-keyed (not
   *  slug-keyed) so the scheduler stays in UUID-land — `Issue.teamId`
   *  is itself a UUID. */
  teamMembersByUuid: Record<string, UserId[]>;
  /** Slice 9 (2026-05-07) — ISO YYYY-MM-DD set of leave days per
   *  member (UUID). The scheduler treats these as unavailable working
   *  days when placing greedy bars on that member; weekends / holidays
   *  apply on top via the calendar helpers. Optional: callers from
   *  before slice 9 can omit it. */
  memberLeavesByUserId?: Record<string, Set<string>>;
}

export interface SchedulerResult {
  /** Map of issue.key → placed bar. Includes started, pinned, and
   *  successfully-greedy issues. */
  scheduled: Map<string, ScheduledBar>;
  /** Map of issue.key → why we couldn't place it. */
  unscheduled: Map<string, UnscheduledReason>;
  /** Leaf keys silently dropped because the leaf itself OR any ancestor
   *  is in `plan.disabled`. Distinct from `unscheduled`: these issues
   *  are intentionally excluded by the user, not "couldn't place". The
   *  gantt uses this set to drive grey-out + cross-subtree orphan-dep
   *  chips. (Was `excludedDueToDisabledEpic` pre-2026-05-07 when only
   *  Epic rows were toggleable.) */
  excludedDueToDisabled: Set<string>;
}

// ---------------------------------------------------------------------------
// Internal helpers (private to this module).
//
// None of these belong in `fixtures.ts`: they are scheduler-shaped
// (date-comparison, ledger advance) rather than fundamental
// working-day math. `fixtures.ts` already exports the calendar atoms
// (`isWorkingDay`, `addWorkingDays`, ...); these helpers compose them
// for the specific job of placing bars. Keeping them here matches the
// repo convention of "private helpers next to the only consumer".
// ---------------------------------------------------------------------------

/** ISO compare. YYYY-MM-DD strings are lexicographically date-ordered. */
function isoLte(a: string, b: string): boolean { return a <= b; }
function isoLt(a: string, b: string): boolean { return a < b; }
function isoMax(a: string, b: string): string { return a >= b ? a : b; }

/** Advance to the next working day if `iso` falls on a weekend / holiday;
 *  otherwise return it unchanged. `addWorkingDays(iso, 0)` does NOT
 *  snap (per its docstring), so we roll forward in single-day steps. */
function snapForwardToWorkingDay(iso: string): string {
  let cursor = iso;
  // Bound the loop defensively; calendar gaps are at most a few days.
  for (let i = 0; i < 14; i++) {
    if (isWorkingDay(cursor)) return cursor;
    cursor = addWorkingDays(cursor, 1);
    // After one positive step `addWorkingDays` is guaranteed to land
    // on a working day, so the loop terminates on iter ≤ 1 in practice.
  }
  return cursor;
}

/**
 * Slice 9: like `snapForwardToWorkingDay` but additionally skips days in
 * `leaveSet` (the member's leave list). `addWorkingDays` is calendar-only
 * so we walk one working day at a time. Bound is generous because a
 * member could chain a long stretch of leave; in pathological cases the
 * loop runs until it finds a free slot or gives up. Per the slice spec,
 * the scheduler may spill past the window — leaves never block placement
 * outright, they just push it later.
 */
function snapForwardToAvailable(
  iso: string,
  leaveSet: Set<string> | undefined,
): string {
  let cursor = snapForwardToWorkingDay(iso);
  if (!leaveSet || leaveSet.size === 0) return cursor;
  // 365 working-day cap is plenty (a year of leave starting today is
  // already a degenerate state for a planner scenario).
  for (let i = 0; i < 365; i++) {
    if (!leaveSet.has(cursor)) return cursor;
    cursor = addWorkingDays(cursor, 1);
  }
  return cursor;
}

/**
 * Slice 9: compute the inclusive end-date for a span of `duration`
 * available working days starting at `start`, where "available" means
 * working day AND not in the member's leave set. Walks day-by-day so
 * we can probe leave membership on each step. For an empty leaveSet
 * this collapses to `addWorkingDays(start, duration - 1)`.
 *
 * Frozen bars (started + pinned) skip this — the scheduler is permissive
 * on user-declared dates. Only greedy placement honours leave days.
 */
function endForAvailableSpan(
  start: string,
  duration: number,
  leaveSet: Set<string> | undefined,
): string {
  if (!leaveSet || leaveSet.size === 0) {
    return addWorkingDays(start, duration - 1);
  }
  // `start` is already snapped to an available working day by the
  // caller; count it as day 1 of the span.
  let consumed = 1;
  let cursor = start;
  // Same defensive bound as the snap helper.
  for (let i = 0; consumed < duration && i < 365; i++) {
    cursor = addWorkingDays(cursor, 1);
    if (leaveSet.has(cursor)) continue;
    consumed++;
  }
  return cursor;
}

/** Project an `(issue.estimate)` value to a working-day duration of at
 *  least 1 day, mirroring the rule in the inspector. */
function durationDaysFor(estimate: number): number {
  return Math.max(1, Math.ceil(estimate / IDEAL_POINTS_PER_DAY));
}

/** Walk the parent chain on `issue` to find the first ancestor that
 *  satisfies `pred`. Defensive against cycles via a visited set (the
 *  hierarchy must be a tree, but a corrupt fixture / blob shouldn't
 *  hang us). */
function findAncestor(
  issueKey: string,
  byKey: Map<string, Issue>,
  pred: (issue: Issue) => boolean,
): Issue | null {
  const seen = new Set<string>();
  let cur = byKey.get(issueKey);
  while (cur && cur.parent && !seen.has(cur.parent)) {
    seen.add(cur.parent);
    const parent = byKey.get(cur.parent);
    if (!parent) return null;
    if (pred(parent)) return parent;
    cur = parent;
  }
  return null;
}

/** Per-member ledger: maps `userId` → next free working day (ISO).
 *  Tasks for a single member land back-to-back with no overlap. */
type Ledger = Map<UserId, string>;

/** Mark `[startDate, endDate]` as occupied for `userId` by advancing
 *  their cursor to `addWorkingDays(endDate, 1)` if that's later than
 *  the current cursor. */
function occupy(ledger: Ledger, userId: UserId, endDate: string): void {
  const nextFree = addWorkingDays(endDate, 1);
  const cur = ledger.get(userId);
  if (!cur || isoLt(cur, nextFree)) {
    ledger.set(userId, nextFree);
  }
}

/** Get the member's earliest free working day, defaulting to
 *  `tomorrowFloor` (which is itself already a working day). */
function nextFreeDay(ledger: Ledger, userId: UserId, tomorrowFloor: string): string {
  const cur = ledger.get(userId);
  if (!cur) return tomorrowFloor;
  return isoMax(cur, tomorrowFloor);
}

/** Detect a cycle starting from `issueKey` in the dependsOn graph
 *  encoded by `byKey`. Returns true if any cycle is reachable. */
function hasDependsOnCycle(
  issueKey: string,
  byKey: Map<string, Issue>,
): boolean {
  // Iterative DFS with a path set to detect back edges.
  const onPath = new Set<string>();
  const finished = new Set<string>();
  type Frame = { key: string; idx: number };
  const stack: Frame[] = [{ key: issueKey, idx: 0 }];
  onPath.add(issueKey);
  while (stack.length) {
    const top = stack[stack.length - 1];
    const issue = byKey.get(top.key);
    const preds = issue?.dependsOn ?? [];
    if (top.idx >= preds.length) {
      onPath.delete(top.key);
      finished.add(top.key);
      stack.pop();
      continue;
    }
    const next = preds[top.idx++];
    if (finished.has(next)) continue;
    if (onPath.has(next)) return true;
    onPath.add(next);
    stack.push({ key: next, idx: 0 });
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function scheduleIssues(input: SchedulerInput): SchedulerResult {
  const { issues, plan, today, teamMembersByUuid } = input;
  const memberLeavesByUserId = input.memberLeavesByUserId ?? {};

  const scheduled = new Map<string, ScheduledBar>();
  const unscheduled = new Map<string, UnscheduledReason>();
  const excludedDueToDisabled = new Set<string>();

  // Index for fast lookup by key (parent walk, dependsOn resolution).
  const byKey = new Map<string, Issue>();
  for (const i of issues) byKey.set(i.key, i);

  // The earliest day a brand-new greedy bar can start: tomorrow,
  // snapped forward to a working day. `addWorkingDays(today, 1)`
  // already lands on a working day per its contract.
  const tomorrowFloor = addWorkingDays(today, 1);

  // Universal-disable (2026-05-07): the disabled set may now contain
  // any issue type (Task / Bug / Story / Epic). The leaf is excluded if
  // its own key OR any ancestor's key is in the set.
  const disabled = new Set(plan.disabled);

  // Filter to leaves (Tasks + Bugs) that aren't disabled (self or via
  // ancestor). Stories/Epics derive their bar from descendants at
  // render time, so they're never scheduled here.
  const leaves: Issue[] = [];
  for (const issue of issues) {
    if (issue.type !== 'T' && issue.type !== 'B') continue;
    if (disabled.size > 0) {
      // Self or ancestor in disabled set — drop and surface for the
      // gantt's grey-out / orphan-dep treatment.
      const isSelfDisabled = disabled.has(issue.key);
      const disabledAncestor = !isSelfDisabled
        ? findAncestor(issue.key, byKey, (anc) => disabled.has(anc.key))
        : null;
      if (isSelfDisabled || disabledAncestor) {
        excludedDueToDisabled.add(issue.key);
        continue;
      }
    }
    leaves.push(issue);
  }

  // Effective assignee resolution. The override map's `null` values are
  // semantically distinct from "key absent" — `null` means the user
  // explicitly cleared the assignee in the plan; absent means fall back
  // to the BE assignee on the issue.
  const effectiveAssignee = (issue: Issue): UserId | null => {
    if (issue.key in plan.assigneeOverrides) {
      return plan.assigneeOverrides[issue.key];
    }
    return issue.assigneeUserId ?? null;
  };

  // Partition: started / pinned / greedy. Started takes precedence over
  // a pin (an in-flight Task isn't a hypothetical anymore — its dates
  // are reality). Pinned takes precedence over greedy.
  const started: Issue[] = [];
  const pinned: Issue[] = [];
  const greedy: Issue[] = [];
  for (const issue of leaves) {
    const isStarted = !!(
      issue.startDate && issue.endDate
      && isoLte(issue.startDate, today)
      && isoLt(today, issue.endDate)
    );
    const isPinned = issue.key in plan.pinnedDates;
    if (isStarted) {
      started.push(issue);
    } else if (isPinned) {
      pinned.push(issue);
    } else {
      greedy.push(issue);
    }
  }

  // Per-member ledger. Initial value defaults to `tomorrowFloor` for
  // any member we encounter; `nextFreeDay` handles the absent case.
  const ledger: Ledger = new Map();

  // Pass 1: place started + pinned (frozen) and pre-occupy ledgers.
  for (const issue of started) {
    const assignee = effectiveAssignee(issue);
    // Started Tasks must already have dates (guarded by partition).
    const bar: ScheduledBar = {
      startDate: issue.startDate!,
      endDate: issue.endDate!,
      assigneeUserId: assignee,
      reason: 'started',
    };
    scheduled.set(issue.key, bar);
    if (assignee) occupy(ledger, assignee, bar.endDate);
  }
  for (const issue of pinned) {
    const pin = plan.pinnedDates[issue.key];
    const assignee = effectiveAssignee(issue);
    const bar: ScheduledBar = {
      startDate: pin.startDate,
      endDate: pin.endDate,
      assigneeUserId: assignee,
      reason: 'pinned',
    };
    scheduled.set(issue.key, bar);
    if (assignee) occupy(ledger, assignee, bar.endDate);
  }

  // Pass 2: greedy in priority order.
  //
  // Order: keys named in `plan.priority` (in that order) first, then
  // any greedy key not listed, sorted by **LPT (Longest Processing
  // Time first)** — `estimate DESC`, with `key` as the deterministic
  // tiebreaker. Team-on-Issue slice 6 (2026-05-07): big tasks first
  // tends to produce shorter overall makespan than naive input order
  // because small tasks can backfill around the big bar's tail
  // instead of being stuck in front of it. The `plan.priority` order
  // is sacred — drag-determined positions are preserved verbatim;
  // LPT only affects items the user hasn't pinned a position for.
  // Items with `estimate == null` get treated as 0 (effectively
  // scheduled last among un-prioritized items) — they're "unknown
  // size" placeholders that don't carry a real workload commitment,
  // and the effort-gate below will mark them `'no-effort'` anyway.
  // Stable: dedupe explicit priority entries, drop entries that
  // aren't in our greedy set.
  const greedyByKey = new Map<string, Issue>();
  for (const i of greedy) greedyByKey.set(i.key, i);
  const orderedGreedy: Issue[] = [];
  const consumed = new Set<string>();
  for (const key of plan.priority) {
    if (consumed.has(key)) continue;
    const issue = greedyByKey.get(key);
    if (issue) {
      orderedGreedy.push(issue);
      consumed.add(key);
    }
  }
  const remaining = greedy
    .filter((i) => !consumed.has(i.key))
    .sort((a, b) => {
      const ea = a.estimate ?? 0;
      const eb = b.estimate ?? 0;
      if (eb !== ea) return eb - ea;            // LPT — bigger first
      return a.key.localeCompare(b.key);         // determinism
    });
  for (const issue of remaining) {
    orderedGreedy.push(issue);
    consumed.add(issue.key);
  }

  for (const issue of orderedGreedy) {
    // Effort gate.
    if (!issue.estimate || issue.estimate <= 0) {
      unscheduled.set(issue.key, 'no-effort');
      continue;
    }

    // Cycle defence — bail before resolving predecessors.
    if (hasDependsOnCycle(issue.key, byKey)) {
      unscheduled.set(issue.key, 'cycle');
      continue;
    }

    // Earliest start from dependsOn predecessors. A predecessor that
    // isn't placed (unscheduled, dropped under disabled Epic, missing
    // from the input entirely) blocks this issue. The catch-all
    // bucket is `'blocked-by-disabled-epic'` per the slice spec — it
    // covers "predecessor isn't placed for any reason" so the UI
    // can surface a single recovery prompt.
    let depFloor: string | null = null;
    let blocked = false;
    for (const predKey of issue.dependsOn ?? []) {
      const predBar = scheduled.get(predKey);
      if (!predBar) {
        blocked = true;
        break;
      }
      const dayAfter = addWorkingDays(predBar.endDate, 1);
      if (!depFloor || isoLt(depFloor, dayAfter)) depFloor = dayAfter;
    }
    if (blocked) {
      unscheduled.set(issue.key, 'blocked-by-disabled-epic');
      continue;
    }

    // The shared floor before considering the member ledger: the later
    // of `tomorrowFloor` and the dependency floor.
    const baseFloor = depFloor ? isoMax(tomorrowFloor, depFloor) : tomorrowFloor;
    // Defensive snap (depFloor came from `addWorkingDays(..., 1)` which
    // already lands on a working day, but a future change might lift
    // that invariant).
    const snappedBaseFloor = snapForwardToWorkingDay(baseFloor);

    // Resolve candidate members. Team-on-Issue slice 4: read
    // `issue.teamId` (UUID) instead of `plan.teamAttachments`. The team
    // is now part of the issue itself; the planner team picker writes
    // through to the BE via `patchIssue({ teamId })` (see planner-gantt).
    const assignee = effectiveAssignee(issue);
    let candidates: UserId[];
    if (assignee) {
      candidates = [assignee];
    } else {
      const teamId = issue.teamId;
      if (!teamId) {
        unscheduled.set(issue.key, 'no-team-or-assignee');
        continue;
      }
      const members = teamMembersByUuid[teamId] ?? [];
      if (members.length === 0) {
        unscheduled.set(issue.key, 'team-empty');
        continue;
      }
      candidates = members;
    }

    // Pick the candidate with the earliest start. Tie-break by UUID
    // alphabetic for determinism (per spec).
    const duration = durationDaysFor(issue.estimate);
    let bestUser: UserId | null = null;
    let bestStart: string | null = null;
    // Sort candidates so iteration order is stable; this is what
    // makes ties deterministic when two members share the same free
    // day.
    const sortedCandidates = [...candidates].sort();
    for (const userId of sortedCandidates) {
      const memberFloor = nextFreeDay(ledger, userId, snappedBaseFloor);
      // Slice 9: per the spec, frozen (started + pinned) bars are NOT
      // moved by leave — those dates are user-declared reality. Greedy
      // placement, on the other hand, must avoid leave days for the
      // chosen member. Snap forward past any leave day at the start of
      // the span so the bar lands on the first available working day.
      // Within the span, `endForAvailableSpan` skips leave days and
      // extends the end date instead. Note: the window is a viewport
      // concept, so a span may legitimately spill past `plan.window.end`
      // when the member has heavy leave near the start.
      const leaveSet = memberLeavesByUserId[userId];
      const rawStart = isoMax(memberFloor, snappedBaseFloor);
      const start = snapForwardToAvailable(rawStart, leaveSet);
      if (bestStart === null || isoLt(start, bestStart)) {
        bestStart = start;
        bestUser = userId;
      }
    }

    // sortedCandidates was non-empty above, so bestUser/bestStart are set.
    // The branch is here to satisfy the type system without a `!`.
    if (!bestUser || !bestStart) {
      unscheduled.set(issue.key, 'no-team-or-assignee');
      continue;
    }

    // Span = duration available working days inclusive (Slice 9: skip
    // leave days for the chosen member). For a member with no leave
    // this collapses to `addWorkingDays(bestStart, duration - 1)`.
    const endDate = endForAvailableSpan(
      bestStart,
      duration,
      memberLeavesByUserId[bestUser],
    );

    // Sanity check the working-day span actually covers `duration`.
    // (It should, by construction, but keep the assertion soft —
    // we'd rather place a slightly-wrong bar than throw.)
    const wd = workingDaysBetween(bestStart, endDate);
    if (wd <= 0) {
      // Can only hit this if addWorkingDays somehow regressed; bail
      // gracefully by flagging the issue rather than crashing.
      unscheduled.set(issue.key, 'no-effort');
      continue;
    }

    const bar: ScheduledBar = {
      startDate: bestStart,
      endDate,
      assigneeUserId: bestUser,
      reason: 'greedy',
    };
    scheduled.set(issue.key, bar);
    occupy(ledger, bestUser, endDate);
  }

  return { scheduled, unscheduled, excludedDueToDisabled };
}
