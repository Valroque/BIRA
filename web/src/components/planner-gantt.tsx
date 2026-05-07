// Planner Gantt — slices 4-5 of the workspace planner.
//
// **Slice 4 (2026-05-06)** — first render. Distinct from `IssuesGantt`
// per `memory/project_planning_vs_reality_gantt.md`: the planner is the
// FE-only what-if sandbox, never writes to the BE, never writes to the
// `bira:issue-overrides:v2` blob (that's the planning-gantt seed shared
// with My Issues / All Issues). All planner mutations route through
// `usePlanner()` setters and land in `bira:planner:<tenant>:<workspace>`.
//
// Drag-to-pin updates `plan.pinnedDates`. Click-without-drag opens an
// edit popover with an assignee picker that writes
// `plan.assigneeOverrides`. Started Tasks (in-flight today) and pinned
// Tasks render with a small lock/pin icon to surface their frozen
// status; the rest are greedy placements computed by `scheduleIssues()`
// (slice 3) on every state change.
//
// **Slice 5 (2026-05-06)** — drag-to-reorder priority on the y axis.
// Each row carries a grip handle (left of the chevron) in the label
// column. Mousedown-on-handle starts a row reorder gesture; mousedown
// on the bar still owns bar-drag. The reorder gesture validates drop
// targets against the same-parent constraint (a Story can only land
// among its sibling Stories under its Epic; Tasks/Bugs only among their
// siblings under the same Story or Epic), then rebuilds the flat
// `plan.priority` array via a DFS walk so visible row order matches
// scheduler tie-break order. Dragging a container cascades its whole
// subtree.
//
// **Slice 7 (2026-05-06)** — fleshed-out bar-edit popover. The slice-4
// stub picker grows into a small "edit this leaf in the plan" panel:
//   - Assignee section (Tasks + Bugs): searchable user picker writing
//     `plan.assigneeOverrides[key]`. Two distinct clear actions ONLY
//     surface when `key in plan.assigneeOverrides`:
//       - "Clear assignee" → setAssigneeOverride(key, null) — explicit
//         no-assignee in this plan; falls through to greedy team-pick.
//       - "Revert to default" → clearAssigneeOverride(key) — drop the
//         override entry and fall back to the BE-canonical assignee.
//   - Team section (Tasks ONLY — Bugs hide it): team picker. Per the
//     Team-on-Issue slice 4 (2026-05-07) update, team picks now write
//     directly to the BE via `useIssues().patchIssue({ teamId })` —
//     the documented exception to the planner's FE-only stance, since
//     team is an organisational decision that should stick across
//     scenarios. Detach button calls `patchIssue({ teamId: null })`.
//     The assignee picker still writes to plan state.
//     When attached AND no resolved assignee, a hint explains the
//     "earliest free member of <team>" greedy-pick semantics so the
//     placement doesn't feel magical.
//   - Header chips: "Plan override" / "Plan team" badges when those
//     override entries exist for this issue.
//   - Bar-side visual indicators: star icon at the right of the bar
//     for plan-assignee-override; dotted accent left border for
//     team-attached-but-no-assignee. Stack with the slice-4 lock/pin
//     icons via the existing 6px gap.
//
// What we don't do here:
//   - Disable-Epic toggle + dependency cascade (slice 6 — already done).
//   - Polished unscheduled rail / empty states (slice 8).
//
// We DO copy the visual + drag structure of `issues-gantt.tsx` and
// re-import its pure helpers from `gantt-utils.ts` rather than forking
// them. The React layer (rows, popover) is local because the planner
// has different persistence targets — flag-based switching of write
// destinations was explicitly disallowed in the design call.

import {
  Fragment, useCallback, useMemo, useRef, useState,
  type CSSProperties,
} from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './icons';
import { TypeChip, IssueId, Avatar } from './shell';
import { useDismiss } from './use-dismiss';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './modal';
import { type Issue, type Milestone } from '../fixtures';
import { useProjects } from '../state/projects';
import { useUsers } from '../state/users';
import { useTeams } from '../state/teams';
import { useIssues } from '../state/issues';
import type { Team } from '../api/adapters/team.adapter';
import { usePlanner, toIsoDate } from '../state/planner';
import type { PlannerState } from '../state/planner';
import { EmptyState } from './states';
import {
  scheduleIssues,
  type ScheduledBar,
  type SchedulerResult,
  type UnscheduledReason,
} from './planner-scheduler';
import {
  buildDayTicks,
  buildMonthSpans,
  barFor,
  dayToIso,
  deriveRange,
  toDayNumber,
  type BarSpec,
  type DayRange,
  type DayTick,
} from './gantt-utils';

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export interface PlannerGanttProps {
  /** All workspace issues already filtered by the parent (e.g. issues
   *  filtered by time window). The component will further drop empty
   *  Epics/Stories internally. */
  issues: Issue[];
  /** Tenant + workspace from useTenantContext — for the bar-link href. */
  tenant: string;
  workspace: string;
  /** today as ISO YYYY-MM-DD. Passed in for purity / SSR-friendliness. */
  today: string;
  /** Hierarchy collapse state lifted to the page so the page-level
   *  "Collapse all" button can drive it. Set of container issue keys
   *  (Story/Epic) that are collapsed. */
  collapsedNodes: Set<string>;
  setCollapsedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Assignee-group collapse state, lifted alongside `collapsedNodes` so
   *  the same toolbar button can collapse all groups in assignee mode.
   *  Keys are user UUIDs, plus `UNSCHEDULED_GROUP_KEY` for the
   *  unscheduled bucket. */
  collapsedUserGroups: Set<string>;
  setCollapsedUserGroups: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Workspace milestones to surface as flag chips in the header + dashed
   *  vertical guides across all rows. Read-only on the planner — editing
   *  stays on the milestones surface (reality), the planner just visualises
   *  them as deadline overlays. Empty / undefined → no overlay. */
  milestones?: Milestone[];
}

// Pre-computed milestone position used by both the header flag chips and
// the per-row vertical dashed lines. Mirrors `MilestoneMark` in
// issues-gantt.tsx — the planner is a separate product, so the two stay
// independent rather than sharing a util module.
interface PlannerMilestoneMark {
  id: string;
  name: string;
  description?: string;
  date: string;
  /** Centre x in pixels within the timeline track. */
  centre: number;
  /** Vermillion when overdue, accent when upcoming. */
  color: string;
  isOverdue: boolean;
}

// ---------------------------------------------------------------------------
// Layout constants — match the IssuesGantt feel so users navigating
// across the two surfaces don't get yanked between dimensions.
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 32;
const LABEL_COL_WIDTH = 360;
const HEADER_HEIGHT = 56;
/** Group-header row height for the assignee-grouped view (slice 10).
 *  Same value as IssuesGantt's GROUP_HEADER_HEIGHT — chose deliberately
 *  to keep the visual rhythm consistent across the two surfaces. */
const GROUP_HEADER_HEIGHT = 32;

// ---------------------------------------------------------------------------
// Tree row (mirrors IssuesGantt.buildAndFlattenTree, no group axis here —
// the planner is always a single flat list ordered by priority + hierarchy)
// ---------------------------------------------------------------------------

interface TreeRow {
  issue: Issue;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  parentChainCollapsed: boolean;
}

function buildAndFlattenTree(items: Issue[], collapsedNodes: Set<string>): TreeRow[] {
  const keys = new Set(items.map((i) => i.key));
  const childMap: Record<string, Issue[]> = {};
  const roots: Issue[] = [];
  for (const i of items) {
    if (i.parent && keys.has(i.parent)) {
      (childMap[i.parent] ??= []).push(i);
    } else {
      roots.push(i);
    }
  }
  const out: TreeRow[] = [];
  const walk = (issue: Issue, depth: number, ancestorCollapsed: boolean) => {
    const children = childMap[issue.key] ?? [];
    const hasChildren = children.length > 0;
    const isExpanded = !collapsedNodes.has(issue.key);
    out.push({
      issue, depth, hasChildren, isExpanded,
      parentChainCollapsed: ancestorCollapsed,
    });
    const hideChildren = ancestorCollapsed || !isExpanded;
    for (const c of children) walk(c, depth + 1, hideChildren);
  };
  for (const r of roots) walk(r, 0, false);
  return out;
}

// ---------------------------------------------------------------------------
// Apply the scheduler result on top of the source issues. Leaves get the
// placed dates / assignee; containers (Story/Epic) keep their natural
// shape — `barFor` derives their span from the post-scheduler leaves.
//
// We don't mutate; we return a fresh array of issues with the planner
// view layered on. The original Issue objects in `useIssues()` stay
// untouched so other consumers (My Issues, All Issues) keep reading the
// canonical BE state.
// ---------------------------------------------------------------------------

function applySchedule(
  issues: Issue[],
  result: SchedulerResult,
): { rendered: Issue[]; renderedByKey: Map<string, Issue> } {
  const rendered: Issue[] = [];
  const renderedByKey = new Map<string, Issue>();
  for (const issue of issues) {
    if (issue.type === 'T' || issue.type === 'B') {
      const placed = result.scheduled.get(issue.key);
      if (placed) {
        const next: Issue = {
          ...issue,
          startDate: placed.startDate,
          endDate: placed.endDate,
          assigneeUserId: placed.assigneeUserId,
        };
        rendered.push(next);
        renderedByKey.set(next.key, next);
      } else if (result.unscheduled.has(issue.key)) {
        // Drop the bar for unscheduled leaves so the row label still
        // appears but no bar is drawn. Slice 8 will move these into a
        // dedicated rail.
        const next: Issue = {
          ...issue,
          startDate: undefined,
          endDate: undefined,
        };
        rendered.push(next);
        renderedByKey.set(next.key, next);
      } else {
        // Should not happen — scheduler emits every leaf in one bucket
        // or the other. Fall back to passing the issue through.
        rendered.push(issue);
        renderedByKey.set(issue.key, issue);
      }
    } else {
      rendered.push(issue);
      renderedByKey.set(issue.key, issue);
    }
  }
  return { rendered, renderedByKey };
}

// ---------------------------------------------------------------------------
// Container filter — drop Epics/Stories with no descendant leaf rendered
// in the result set. Mirrors the parent-walk pattern from IssuesGantt.
// ---------------------------------------------------------------------------

function filterEmptyContainers(rendered: Issue[]): Issue[] {
  const byKey = new Map<string, Issue>();
  for (const i of rendered) byKey.set(i.key, i);
  // For each container, check whether at least one descendant Task/Bug
  // remains in the rendered set. A container with no surviving leaves
  // has nothing to roll up and is dropped.
  const hasLiveLeaf = (issue: Issue, seen: Set<string>): boolean => {
    if (issue.type === 'T' || issue.type === 'B') return byKey.has(issue.key);
    if (seen.has(issue.key)) return false;
    seen.add(issue.key);
    if (!issue.children) return false;
    for (const c of issue.children) {
      const child = byKey.get(c);
      if (!child) continue;
      if (hasLiveLeaf(child, seen)) return true;
    }
    return false;
  };
  return rendered.filter((issue) => {
    if (issue.type === 'T' || issue.type === 'B') return true;
    return hasLiveLeaf(issue, new Set());
  });
}

// ---------------------------------------------------------------------------
// Slice 5 — priority rebuild on drag-reorder.
//
// `plan.priority` is a flat ordered key list the scheduler uses to break
// ties. To reflect a y-axis reorder, we rebuild it via a DFS walk over the
// post-drop tree of the current visible items. For keys we don't own
// (issues outside the time window, etc.) we preserve their relative order
// from the previous priority list and append at the tail — that satisfies
// the "preserve relative order of unchanged keys" requirement without
// surfacing invisible state on the UI.
// ---------------------------------------------------------------------------

const ROOT_PARENT_KEY = '__root__';

/** Build a parent-key → ordered children-key map for `items`. Items
 *  whose `parent` isn't in the visible set are treated as roots. The
 *  insertion order of `items` becomes the natural sibling order. */
function buildSiblingMap(items: Issue[]): {
  childrenOf: Map<string, string[]>;
  parentOf: Map<string, string>;
} {
  const keys = new Set(items.map((i) => i.key));
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  childrenOf.set(ROOT_PARENT_KEY, []);
  for (const i of items) {
    const p = i.parent && keys.has(i.parent) ? i.parent : ROOT_PARENT_KEY;
    parentOf.set(i.key, p);
    const arr = childrenOf.get(p) ?? [];
    arr.push(i.key);
    childrenOf.set(p, arr);
  }
  return { childrenOf, parentOf };
}

/** DFS walk producing a flat key list in post-drop visible order. The
 *  walk includes descendants regardless of collapsed state because
 *  `plan.priority` is the scheduler's tie-breaker, not the UI's row
 *  list. Container reorder cascades the whole subtree. */
function flattenForPriority(
  childrenOf: Map<string, string[]>,
): string[] {
  const out: string[] = [];
  const walk = (parentKey: string) => {
    const kids = childrenOf.get(parentKey) ?? [];
    for (const k of kids) {
      out.push(k);
      walk(k);
    }
  };
  walk(ROOT_PARENT_KEY);
  return out;
}

/** Compute the post-drop priority array.
 *  - `items` is the current `filteredRendered` issue list (the keys we
 *    own). The dragged + target keys are guaranteed to be in here.
 *  - Removes the dragged key from its sibling slot, reinserts it relative
 *    to the target. Same-parent invariant is enforced by the caller; we
 *    no-op safely if invariants are violated.
 *  - Then DFS-walks the result and produces a key list. Keys present in
 *    the previous priority but NOT in `items` are appended at the tail
 *    in their original relative order. */
function reorderedPriority(
  items: Issue[],
  draggedKey: string,
  targetKey: string,
  position: 'above' | 'below',
  prevPriority: string[],
): string[] {
  const { childrenOf, parentOf } = buildSiblingMap(items);
  const draggedParent = parentOf.get(draggedKey);
  const targetParent = parentOf.get(targetKey);
  if (!draggedParent || !targetParent || draggedParent !== targetParent) {
    // Guard — caller should have rejected, but be defensive.
    return prevPriority;
  }
  const siblings = childrenOf.get(draggedParent);
  if (!siblings) return prevPriority;
  // Remove dragged from its slot.
  const without = siblings.filter((k) => k !== draggedKey);
  const targetIdx = without.indexOf(targetKey);
  if (targetIdx < 0) return prevPriority;
  const insertAt = position === 'above' ? targetIdx : targetIdx + 1;
  const next = [...without.slice(0, insertAt), draggedKey, ...without.slice(insertAt)];
  childrenOf.set(draggedParent, next);

  const visibleOrdered = flattenForPriority(childrenOf);
  const visibleSet = new Set(visibleOrdered);
  // Preserve previously-prioritised keys we don't own (outside-window,
  // etc.) by appending in their old relative order.
  const tail = prevPriority.filter((k) => !visibleSet.has(k));
  return [...visibleOrdered, ...tail];
}

// ---------------------------------------------------------------------------
// Universal-disable helpers (Epic-only originally; generalised 2026-05-07).
//
// `descendantLeafKeys(rootKey, byKey)` walks the children chain and
// collects every Task/Bug under `rootKey`. For a leaf (Task/Bug) it
// returns just that leaf — so the Task case in the affected-count modal
// reads as "1 self". Reused for the modal AND for marking descendant
// rows greyed in the body.
//
// `crossSubtreeDependentsOf(...)` finds Tasks OUTSIDE the disabled
// subtree whose `dependsOn` predecessor is INSIDE it. The scheduler
// already exposes the exclusion set in
// `SchedulerResult.excludedDueToDisabled`; we just invert it across
// the issue list and drop self-references (a task inside the same
// disabled subtree is greyed, not flagged orphan).
// ---------------------------------------------------------------------------

function descendantLeafKeys(rootKey: string, byKey: Map<string, Issue>): Set<string> {
  const out = new Set<string>();
  const seen = new Set<string>();
  const walk = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    const node = byKey.get(key);
    if (!node) return;
    if (node.type === 'T' || node.type === 'B') {
      out.add(key);
      return;
    }
    if (!node.children) return;
    for (const c of node.children) walk(c);
  };
  walk(rootKey);
  return out;
}

/** Return the set of Task keys outside `rootKey`'s subtree whose
 *  dependsOn list contains at least one Task inside it. Used both to
 *  count cross-subtree dependents at toggle time AND to render the
 *  persistent `orphan dep` chip on still-enabled tasks once the
 *  subtree is disabled. */
function crossSubtreeDependentsOf(
  rootKey: string,
  byKey: Map<string, Issue>,
  issues: Issue[],
): Set<string> {
  const inside = descendantLeafKeys(rootKey, byKey);
  if (inside.size === 0) return new Set();
  const out = new Set<string>();
  for (const issue of issues) {
    if (issue.type !== 'T' && issue.type !== 'B') continue;
    if (inside.has(issue.key)) continue;
    if (!issue.dependsOn || issue.dependsOn.length === 0) continue;
    for (const pred of issue.dependsOn) {
      if (inside.has(pred)) {
        out.add(issue.key);
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Slice 10 (2026-05-07) — assignee-grouped helpers.
//
// `groupSpanFromIssues` derives a faint aggregate bar for a user-group:
// the union of placed (start, end) days across the leaves in the group.
// Mirrors `groupSpan` in `issues-gantt.tsx` but reads `issue.startDate /
// endDate` directly (the planner already projects scheduler placements
// onto the issue copies in `applySchedule`). Returns null for an empty
// group or one whose every leaf is unscheduled — the group header then
// renders no bar (consistent with the "Unscheduled" pseudo-group).
// ---------------------------------------------------------------------------

function groupSpanFromIssues(items: Issue[]): { startDay: number; endDay: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const i of items) {
    if (!i.startDate || !i.endDate) continue;
    const s = toDayNumber(i.startDate);
    const e = toDayNumber(i.endDate);
    if (s < min) min = s;
    if (e > max) max = e;
  }
  if (!isFinite(min)) return null;
  return { startDay: min, endDay: max };
}

/** Sentinel key used in place of a UUID for the "Unscheduled" pseudo-group.
 *  Doubles as the React key for the group header row. Picked to avoid
 *  collisions with any real UUID. */
export const UNSCHEDULED_GROUP_KEY = '__unscheduled__';

// ---------------------------------------------------------------------------
// PlannerGantt
// ---------------------------------------------------------------------------

export function PlannerGantt({ issues, tenant, workspace, today, collapsedNodes, setCollapsedNodes, collapsedUserGroups, setCollapsedUserGroups, milestones }: PlannerGanttProps) {
  const {
    plan, setWindow, setPinnedDates, setAssigneeOverride, clearAssigneeOverride,
    setPriority, toggleDisabled,
  } = usePlanner();
  // Slice 10 (2026-05-07) — UUID resolver for the assignee-grouped view's
  // group headers. UUIDs never render — `getUser(id)?.displayName` is the
  // canonical surface; missing → "Unknown user".
  const { getUser } = useUsers();
  const { teams } = useTeams();
  // Team-on-Issue slice 4 (2026-05-07) — the planner's team picker
  // writes through to the BE. This is the **documented exception** to
  // the planner's FE-only stance: team is an organisational decision
  // that should stick across scenarios. Assignee picks still go through
  // plan state.
  const { patchIssue } = useIssues();

  // Build `teamMembersByUuid` from the active members of each team.
  // The teams provider hydrates `Team.members` on the list endpoint, so
  // there's no extra fetch needed. UUID-keyed (was slug-keyed pre-slice-4)
  // so it lines up with `Issue.teamId`.
  const teamMembersByUuid = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const t of teams) {
      out[t.id] = t.members.map((m) => m.userId);
    }
    return out;
  }, [teams]);

  // Slice 9: project `plan.memberLeaves` (Record<userId, string[]>) to a
  // Record<userId, Set<string>> view that the scheduler can probe in O(1).
  // Memoised on `plan.memberLeaves` so unrelated plan mutations (priority,
  // pinned dates, etc.) don't rebuild this. Same shape is consumed by the
  // workload pivot — but each component derives its own view rather than
  // routing through props, since both already call `usePlanner()`.
  const memberLeavesByUserId = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    for (const [userId, days] of Object.entries(plan.memberLeaves)) {
      out[userId] = new Set(days);
    }
    return out;
  }, [plan.memberLeaves]);

  // Run the scheduler. Memoised against the inputs so we don't re-run
  // unless one actually changed. The scheduler is pure, so referential
  // equality is a faithful proxy for "needs to re-run".
  const schedule = useMemo(
    () => scheduleIssues({ issues, plan, today, teamMembersByUuid, memberLeavesByUserId }),
    [issues, plan, today, teamMembersByUuid, memberLeavesByUserId],
  );

  // Apply the placement on top of the input issues, then filter empty
  // containers. The post-scheduler issues drive both the row list and
  // `barFor` lookups (so derived Story/Epic bars reflect placed dates).
  const { rendered, renderedByKey } = useMemo(
    () => applySchedule(issues, schedule),
    [issues, schedule],
  );
  const filteredRendered = useMemo(
    () => filterEmptyContainers(rendered),
    [rendered],
  );

  // Apply `plan.priority` to the y-axis. The scheduler already uses it
  // for tie-breaking placement; the gantt's row order has to mirror it
  // so a drag-to-top of an Epic actually shows that Epic at the top.
  // Items present in `plan.priority` come first in that order; unlisted
  // items keep their input order at the tail (Array#sort is stable).
  // `buildAndFlattenTree` then reads sibling order from input iteration
  // order, so a flat sort here cascades correctly through the tree.
  const orderedRendered = useMemo(() => {
    if (plan.priority.length === 0) return filteredRendered;
    const priorityIndex = new Map<string, number>();
    plan.priority.forEach((k, i) => priorityIndex.set(k, i));
    const tail = plan.priority.length;
    return [...filteredRendered].sort((a, b) => {
      const ai = priorityIndex.has(a.key) ? priorityIndex.get(a.key)! : tail;
      const bi = priorityIndex.has(b.key) ? priorityIndex.get(b.key)! : tail;
      return ai - bi;
    });
  }, [filteredRendered, plan.priority]);

  // Hierarchical flatten — same shape as IssuesGantt's tree. Collapse
  // state is lifted to the page (planner.tsx) so the same toggle in the
  // Issue header column can flip both hierarchy + assignee group modes.
  const toggleNode = (id: string) => setCollapsedNodes((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // All container issue keys that are actually parents in the visible
  // tree — used by the Issue-header collapse-all toggle.
  const allContainerKeysInTree = useMemo(() => {
    const keys = new Set(orderedRendered.map((i) => i.key));
    const set = new Set<string>();
    for (const i of orderedRendered) {
      if (i.parent && keys.has(i.parent)) set.add(i.parent);
    }
    return set;
  }, [orderedRendered]);

  const tree = useMemo(
    () => buildAndFlattenTree(orderedRendered, collapsedNodes).filter((row) => !row.parentChainCollapsed),
    [orderedRendered, collapsedNodes],
  );

  // ---- Slice 10 (2026-05-07) — assignee-grouped data --------------------
  //
  // When `plan.ganttGroupBy === 'assignee'` the gantt drops Stories/Epics
  // and buckets the surviving Task/Bug leaves by their *resolved*
  // assignee (override → BE assignee → team-greedy pick — the scheduler's
  // `placed.assigneeUserId`). Leaves the scheduler couldn't place at all
  // land in the "Unscheduled" pseudo-group pinned at the bottom.
  //
  // Computed unconditionally so React's hook order stays stable across
  // toggle flips; `groupBy === 'hierarchy'` simply ignores the result.
  // The cost is small — one O(n) pass over `orderedRendered` plus one
  // sort per group on the placed leaves.
  //
  // Collapse-state is lifted to the page (planner.tsx) so the
  // single "Collapse all / Expand all" toggle in the Issue header
  // can flip it alongside `collapsedNodes`.
  const toggleUserGroup = useCallback((groupKey: string) => {
    setCollapsedUserGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });
  }, []);

  interface UserGroup {
    /** UUID of the resolved assignee, or `UNSCHEDULED_GROUP_KEY` for the
     *  unscheduled bucket. Doubles as React key + collapse-state key. */
    key: string;
    /** Leaves placed under this group, sorted by placed startDate ASC,
     *  issue.key ASC for determinism. */
    items: Issue[];
    /** Display name resolved from `useUsers().getUser(uuid)`. Falls back
     *  to "Unknown user" when the uuid isn't in the directory. The
     *  Unscheduled group uses a fixed label and ignores this. */
    displayName: string;
  }

  const userGroups = useMemo<UserGroup[]>(() => {
    if (plan.ganttGroupBy !== 'assignee') return [];
    const buckets = new Map<string, Issue[]>();
    for (const issue of orderedRendered) {
      // Containers excluded — only Tasks and Bugs participate.
      if (issue.type !== 'T' && issue.type !== 'B') continue;
      const placed = schedule.scheduled.get(issue.key);
      const groupKey = placed?.assigneeUserId ?? UNSCHEDULED_GROUP_KEY;
      const arr = buckets.get(groupKey) ?? [];
      arr.push(issue);
      buckets.set(groupKey, arr);
    }
    const out: UserGroup[] = [];
    for (const [key, items] of buckets) {
      const sorted = [...items].sort((a, b) => {
        // Placed startDate ASC; missing dates sink to the bottom of the
        // group (only relevant for the Unscheduled group's leaves, which
        // by definition lack placed dates).
        const aHas = !!a.startDate;
        const bHas = !!b.startDate;
        if (aHas !== bHas) return aHas ? -1 : 1;
        if (aHas && bHas && a.startDate !== b.startDate) {
          return a.startDate! < b.startDate! ? -1 : 1;
        }
        return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
      });
      const displayName = key === UNSCHEDULED_GROUP_KEY
        ? 'Unscheduled'
        : (getUser(key)?.displayName ?? 'Unknown user');
      out.push({ key, items: sorted, displayName });
    }
    // Sort: alphabetical by displayName for real groups; Unscheduled
    // pinned at the end. Stable by `key` as a final tie-break.
    out.sort((a, b) => {
      if (a.key === UNSCHEDULED_GROUP_KEY) return 1;
      if (b.key === UNSCHEDULED_GROUP_KEY) return -1;
      const cmp = a.displayName.localeCompare(b.displayName);
      if (cmp !== 0) return cmp;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
    return out;
  }, [plan.ganttGroupBy, orderedRendered, schedule.scheduled, getUser]);

  // ---- Time range -------------------------------------------------------
  //
  // The plan.window is the user's visible bound. We start from the
  // scheduler's data-derived range (gives some buffer) and clamp to the
  // window — so a 6-month window stays usable visually even if every
  // leaf falls in the first 3 weeks.
  const today_n = useMemo(() => toDayNumber(today), [today]);
  const windowStart = useMemo(() => toDayNumber(plan.window.start), [plan.window.start]);
  const windowEnd = useMemo(() => toDayNumber(plan.window.end), [plan.window.end]);
  const dataRange = useMemo(() => deriveRange(filteredRendered, today_n), [filteredRendered, today_n]);

  // Clamp data range to the window. If the data range is outside the
  // window entirely, fall back to the window itself.
  const range: DayRange = useMemo(() => ({
    start: Math.max(windowStart, dataRange.start),
    end: Math.min(windowEnd, dataRange.end),
  }), [windowStart, windowEnd, dataRange]);

  const totalDays = Math.max(1, range.end - range.start + 1);
  const empty = range.end < range.start;

  // Auto granularity matches IssuesGantt's auto behaviour — weekly past
  // 90 days, otherwise per-day with a smaller width when long.
  const weekly = totalDays > 90;
  const dayPx = weekly ? 12 : (totalDays > 45 ? 22 : 32);
  const timelineWidth = totalDays * dayPx;

  const months = useMemo(() => buildMonthSpans(range, dayPx), [range, dayPx]);
  const ticks = useMemo(() => buildDayTicks(range, dayPx, today_n, weekly), [range, dayPx, today_n, weekly]);
  const todayOffset = (today_n - range.start) * dayPx + dayPx / 2;

  // Resolve milestones to pixel positions once per relevant change. Out-of-window
  // milestones are dropped so a deadline two years off doesn't squat at the right edge.
  const milestoneMarks = useMemo<PlannerMilestoneMark[]>(() => {
    if (!milestones || milestones.length === 0) return [];
    const out: PlannerMilestoneMark[] = [];
    for (const m of milestones) {
      const day = toDayNumber(m.date);
      if (day < range.start || day > range.end) continue;
      const isOverdue = m.date < today;
      out.push({
        id: m.id,
        name: m.name,
        description: m.description,
        date: m.date,
        centre: (day - range.start) * dayPx + dayPx / 2,
        color: isOverdue ? 'var(--blocked)' : 'var(--accent)',
        isOverdue,
      });
    }
    return out;
  }, [milestones, range.start, range.end, dayPx, today]);

  // ---- Edit popover state -----------------------------------------------
  const [editingId, setEditingId] = useState<string | null>(null);

  // Drag-to-pin commit — writes `plan.pinnedDates`, never touches issues.
  const commitPin = useCallback(
    (key: string, dates: { startDate: string; endDate: string }) => {
      setPinnedDates(key, dates);
    },
    [setPinnedDates],
  );

  // Live-during-drag preview — the plan store is the single source of
  // truth for the planner gantt. Writing the pin every move keeps the
  // bar's current visual position in sync with what the scheduler will
  // see on the next memo pass.
  const previewPin = useCallback(
    (key: string, dates: { startDate: string; endDate: string }) => {
      setPinnedDates(key, dates);
    },
    [setPinnedDates],
  );

  // Assignee override — also routes to the plan store, NOT useIssues.
  const handleAssigneeChange = useCallback(
    (key: string, userId: string | null) => {
      setAssigneeOverride(key, userId);
    },
    [setAssigneeOverride],
  );

  // Team-on-Issue slice 4 (2026-05-07) — team picks DO route to the BE.
  // This is the **documented exception** to the planner's FE-only stance:
  // a team is an organisational decision that should stick across plan
  // scenarios. We pre-clear `assigneeUserId` to keep optimistic state in
  // sync with the BE's auto-clear (assignee + team are mutually exclusive).
  // Errors are best-effort: the optimistic write rolls back on failure
  // and the user sees the bar revert; a future surface might pop a toast.
  const handleSetTeam = useCallback(
    (key: string, teamId: string) => {
      void patchIssue(key, { teamId, assigneeUserId: null });
    },
    [patchIssue],
  );
  const handleClearTeam = useCallback(
    (key: string) => {
      void patchIssue(key, { teamId: null });
    },
    [patchIssue],
  );

  // ---- Slice 5: drag-to-reorder priority -------------------------------
  //
  // Mouse-based drag (mirroring `startBarDrag`) so the gesture composes
  // cleanly with the existing global cursor / userSelect overrides. The
  // bar drag listens on the bar element; the reorder drag listens on the
  // grip handle in the label column — `stopPropagation` on the handle's
  // mousedown keeps them from interfering.

  // Build a parent map off `orderedRendered` (not the collapsed `tree`)
  // — the same-parent constraint is structural, not visibility-driven.
  // Use the priority-ordered list so the drop-position math sees siblings
  // in the same order the user does on screen.
  const parentMap = useMemo(() => {
    const { parentOf } = buildSiblingMap(orderedRendered);
    return parentOf;
  }, [orderedRendered]);

  // ---- Universal-disable visual sets ------------------------------------
  //
  // `descendantsOfDisabled` — every issue (leaf OR container) that lives
  //   under any currently-disabled root. Drives the row greyed-out look.
  //   Includes both leaves (which the scheduler skipped — see
  //   `schedule.excludedDueToDisabled`) and intermediate Stories.
  // `orphanDepKeys` — Tasks NOT under a disabled subtree but whose
  //   dependsOn list contains a leaf inside one. Drives the "orphan dep"
  //   chip on the still-enabled side of the dependency.
  //
  // Both are derived from the *full* issues list (not `filteredRendered`)
  // since a disabled issue can sit outside the time window while still
  // affecting visible tasks. Universal-disable (2026-05-07): "disabled"
  // can now be any issue type, not just Epic.
  const issuesByKey = useMemo(() => {
    const m = new Map<string, Issue>();
    for (const i of issues) m.set(i.key, i);
    return m;
  }, [issues]);

  const descendantsOfDisabled = useMemo(() => {
    const out = new Set<string>();
    for (const rootKey of plan.disabled) {
      // Walk descendants regardless of leaf/container — every node
      // under a disabled root reads as greyed. The disabled node
      // itself is handled separately (the row gets the "disabled in
      // plan" treatment, not the "under a disabled ancestor" one).
      const seen = new Set<string>();
      const walk = (key: string) => {
        if (seen.has(key)) return;
        seen.add(key);
        const node = issuesByKey.get(key);
        if (!node || !node.children) return;
        for (const c of node.children) {
          out.add(c);
          walk(c);
        }
      };
      walk(rootKey);
    }
    return out;
  }, [plan.disabled, issuesByKey]);

  const orphanDepKeys = useMemo(() => {
    if (plan.disabled.length === 0) return new Set<string>();
    // The scheduler-output set is exactly "leaves dropped because they
    // or an ancestor are disabled". A still-enabled Task with a
    // dependsOn into that set is what we want to flag.
    const excluded = schedule.excludedDueToDisabled;
    if (excluded.size === 0) return new Set<string>();
    const out = new Set<string>();
    for (const issue of issues) {
      if (issue.type !== 'T' && issue.type !== 'B') continue;
      // Skip tasks that are themselves under a disabled subtree — those
      // are already greyed; double-flagging would be noise.
      if (excluded.has(issue.key)) continue;
      if (descendantsOfDisabled.has(issue.key)) continue;
      if (!issue.dependsOn || issue.dependsOn.length === 0) continue;
      for (const pred of issue.dependsOn) {
        if (excluded.has(pred)) {
          out.add(issue.key);
          break;
        }
      }
    }
    return out;
  }, [issues, plan.disabled, schedule.excludedDueToDisabled, descendantsOfDisabled]);

  // ---- Slice 8: Unscheduled rail ----------------------------------------
  //
  // The scheduler returns `unscheduled` for every leaf it tried to place
  // but couldn't. Surface them in a single rail at the bottom so the user
  // can see at a glance what's missing — each reason carries a one-click
  // CTA. Excluded-via-disabled leaves are NOT included (those are
  // intentionally removed by the user, already greyed in the main flow).
  // `blocked-by-disabled-epic` IS included — those are still-enabled
  // Tasks whose predecessor lives inside a disabled subtree, exactly the
  // cross-subtree-orphan case worth surfacing.
  const unscheduledRows = useMemo(() => {
    const out: Array<{ issue: Issue; reason: UnscheduledReason }> = [];
    const renderedKeys = new Set(filteredRendered.map((i) => i.key));
    for (const [key, reason] of schedule.unscheduled) {
      if (schedule.excludedDueToDisabled.has(key)) continue;
      // Only include leaves that survived the time-window filter — a
      // leaf outside the visible window has no actionable surface here.
      // The workspace-level empty state covers "no leaves at all".
      if (!renderedKeys.has(key)) continue;
      const issue = issuesByKey.get(key);
      if (!issue) continue;
      out.push({ issue, reason });
    }
    // Stable order: by issue key — deterministic across renders without
    // bringing in priority ordering (the rail is "things to fix", not a
    // priority list).
    out.sort((a, b) => (a.issue.key < b.issue.key ? -1 : a.issue.key > b.issue.key ? 1 : 0));
    return out;
  }, [schedule.unscheduled, schedule.excludedDueToDisabled, filteredRendered, issuesByKey]);

  // Auto-collapsed if the rail would be a long scroll. 5 is the cutoff:
  // small enough that an expanded list of 5 items is roughly two
  // standard rows tall, large enough that 6+ items earn a collapse to
  // keep the gantt the focal point on first paint. Once the user clicks
  // the toggle their choice sticks for the rest of the session — auto
  // is the on-load default, not a recurring decision.
  const [unscheduledManualToggle, setUnscheduledManualToggle] =
    useState<boolean | null>(null);
  const railOverThreshold = unscheduledRows.length > 5;
  const unscheduledCollapsed = unscheduledManualToggle ?? railOverThreshold;
  const toggleUnscheduledCollapsed = useCallback(
    () => setUnscheduledManualToggle((prev) => !(prev ?? railOverThreshold)),
    [railOverThreshold],
  );

  // ---- Confirm-on-affected-deps modal -----------------------------------
  //
  // Toggling an issue OFF (to re-enable it) is non-destructive — it
  // restores everything. We only confirm on the disable direction. The
  // modal is skipped entirely when zero tasks are affected (no
  // descendant leaves, no cross-subtree dependents) for a smoother UX
  // — there's nothing to warn about.
  //
  // Universal-disable (2026-05-07): generalised from Epic-only to any
  // issue type. For Tasks/Bugs the descendant set is just the issue
  // itself (size = 1); for Stories it's the descendant Tasks/Bugs.
  const [confirmDisable, setConfirmDisable] = useState<{
    issue: Issue;
    affectedLeafCount: number;
    crossDependents: string[];
  } | null>(null);

  const onToggleDisable = useCallback((issue: Issue) => {
    const isCurrentlyDisabled = plan.disabled.includes(issue.key);
    if (isCurrentlyDisabled) {
      // Re-enable: no confirm. Restoring is non-destructive.
      toggleDisabled(issue.key);
      return;
    }
    // Disable: only warn when the operation would orphan another issue
    // (a Task outside the cascade whose `dependsOn` includes something
    // we're about to drop). Descendants going away with the parent is
    // expected and reversible — not worth a modal. Crosswalk uses the
    // full issue list, not the window-filtered set, so a disabled
    // Story/Epic outside the visible window still surfaces orphans.
    const crossDeps = crossSubtreeDependentsOf(issue.key, issuesByKey, issues);
    if (crossDeps.size === 0) {
      toggleDisabled(issue.key);
      return;
    }
    // Affected-leaf count is still useful inside the modal as supporting
    // detail (so the user knows what's cascading), but it's not the
    // trigger.
    const descendants = descendantLeafKeys(issue.key, issuesByKey);
    setConfirmDisable({
      issue,
      affectedLeafCount: descendants.size,
      crossDependents: Array.from(crossDeps),
    });
  }, [plan.disabled, toggleDisabled, issuesByKey, issues]);

  const confirmDisableNow = useCallback(() => {
    if (!confirmDisable) return;
    toggleDisabled(confirmDisable.issue.key);
    setConfirmDisable(null);
  }, [confirmDisable, toggleDisabled]);

  // The currently-dragged row's key (drives label opacity), and the
  // resolved drop target / position pair (drives the blue indicator
  // line). Plain state — not refs — because we want re-render on every
  // hit-test update.
  const [reorderDrag, setReorderDrag] = useState<{ key: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<
    { key: string; position: 'above' | 'below' } | null
  >(null);

  // Mirror `dropTarget` into a ref so the global mouseup handler reads
  // the latest value without taking a stale-closure dependency on the
  // state. (Re-attaching the listeners every keypress would defeat the
  // point.) StrictMode-safe — pure mirror, no side effects.
  const dropTargetRef = useRef<typeof dropTarget>(null);
  dropTargetRef.current = dropTarget;

  // Captured at gesture start so the priority rebuild runs against the
  // tree as it was when the user grabbed the row, not whatever the
  // re-render produced mid-drag. Capture `orderedRendered` (the
  // priority-sorted view) so `reorderedPriority` walks siblings in the
  // same order they appear on screen — otherwise the post-drop priority
  // would be computed against the input issue order and the visual fix
  // from `orderedRendered` would never reach the priority array.
  const reorderRef = useRef<{
    draggedKey: string;
    items: Issue[];
    parentMap: Map<string, string>;
  } | null>(null);

  const startRowReorder = useCallback(
    (issueKey: string, e: React.MouseEvent) => {
      // Stop propagation so the row's bar / track mousedown handlers don't
      // also kick in. preventDefault stops the browser's text-selection
      // gesture from competing with the drag.
      e.preventDefault();
      e.stopPropagation();
      const draggedParent = parentMap.get(issueKey);
      if (!draggedParent) return;

      reorderRef.current = {
        draggedKey: issueKey,
        items: orderedRendered,
        parentMap,
      };
      setReorderDrag({ key: issueKey });
      setDropTarget(null);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      // Hit-test the cursor against every label cell (DOM-anchored by
      // `data-planner-row-key`). The cell whose vertical midpoint the
      // cursor is closest to wins. Above/below is decided by which half
      // of the cell the cursor sits in.
      const onMove = (ev: MouseEvent) => {
        const cells = document.querySelectorAll<HTMLElement>(
          '[data-planner-row-key]',
        );
        let bestKey: string | null = null;
        let bestPos: 'above' | 'below' = 'below';
        let bestDist = Infinity;
        for (const cell of Array.from(cells)) {
          const key = cell.getAttribute('data-planner-row-key');
          if (!key || key === issueKey) continue;
          const r = cell.getBoundingClientRect();
          const mid = r.top + r.height / 2;
          const dist = Math.abs(ev.clientY - mid);
          if (dist < bestDist) {
            bestDist = dist;
            bestKey = key;
            bestPos = ev.clientY < mid ? 'above' : 'below';
          }
        }
        if (!bestKey) {
          setDropTarget(null);
          document.body.style.cursor = 'grabbing';
          return;
        }
        // Same-parent constraint. Drag of an Epic only lands among
        // Epics (or other roots); a Story under Epic A only lands
        // among Stories under that same Epic; Tasks/Bugs only among
        // siblings under their own Story or Epic.
        const targetParent = parentMap.get(bestKey);
        if (targetParent !== draggedParent) {
          setDropTarget(null);
          document.body.style.cursor = 'not-allowed';
          return;
        }
        document.body.style.cursor = 'grabbing';
        setDropTarget({ key: bestKey, position: bestPos });
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        const captured = reorderRef.current;
        const liveDrop = dropTargetRef.current;
        setDropTarget(null);
        setReorderDrag(null);
        reorderRef.current = null;

        if (!captured || !liveDrop) return;
        const next = reorderedPriority(
          captured.items,
          captured.draggedKey,
          liveDrop.key,
          liveDrop.position,
          plan.priority,
        );
        // Skip the write if nothing changed (e.g. the user dropped on
        // the same slot the row already occupied).
        if (next.length === plan.priority.length
            && next.every((k, i) => k === plan.priority[i])) {
          return;
        }
        setPriority(next);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [orderedRendered, parentMap, plan.priority, setPriority],
  );

  if (empty) {
    // Slice 8: centred panel + one-click escape hatch. The "Widen
    // window" preset is intentionally outside the toolbar's preset
    // list — it's a "show me everything reasonable" extreme that
    // should only be reachable from this dead-end, not as a casual
    // pick. Range: today − 6mo → today + 12mo.
    const widen = () => {
      const t = new Date(today);
      const startD = new Date(t);
      startD.setMonth(startD.getMonth() - 6);
      const endD = new Date(t);
      endD.setMonth(endD.getMonth() + 12);
      setWindow({ start: toIsoDate(startD), end: toIsoDate(endD) });
    };
    return (
      <div style={{
        height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        padding: '40px 32px',
      }}>
        <EmptyState
          icon="calendar"
          title="No tasks in this time window"
          description="Widen the window above to see tasks scheduled earlier or later."
          action={(
            <button
              type="button"
              onClick={widen}
              className="btn btn-primary btn-sm"
            >
              <Icon name="calendar" size={13} />Widen window
            </button>
          )}
        />
      </div>
    );
  }

  // Grouping mode is owned by the planner state and driven from the
  // page-level toolbar's Group: select (see `screens/planner.tsx`).
  const groupBy = plan.ganttGroupBy;
  const groupedView = groupBy === 'assignee';

  // Issue-header "Collapse all / Expand all" — toggles whichever axis is
  // currently active. Hierarchy mode → containers (Story/Epic). Assignee
  // mode → user groups (the `userGroups` set, including the unscheduled
  // bucket). The button is hidden when there's nothing collapsible.
  const allUserGroupKeys = useMemo(
    () => new Set(userGroups.map((g) => g.key)),
    [userGroups],
  );
  const isAnyCollapsed = groupedView
    ? collapsedUserGroups.size > 0
    : collapsedNodes.size > 0;
  const collapsibleCount = groupedView
    ? allUserGroupKeys.size
    : allContainerKeysInTree.size;
  const handleToggleCollapseAll = useCallback(() => {
    if (groupedView) {
      setCollapsedUserGroups((prev) => (prev.size > 0 ? new Set() : new Set(allUserGroupKeys)));
    } else {
      setCollapsedNodes((prev) => (prev.size > 0 ? new Set() : new Set(allContainerKeysInTree)));
    }
  }, [groupedView, allUserGroupKeys, allContainerKeysInTree, setCollapsedUserGroups, setCollapsedNodes]);

  return (
    <div style={{ display: 'inline-block', minWidth: '100%' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${LABEL_COL_WIDTH}px ${timelineWidth}px`,
        }}
      >
        {/* Header — issue label column. Holds the "Collapse all / Expand
            all" toggle so it sits adjacent to the chevrons it controls,
            which is the obvious spot in trackers like Linear/Asana. */}
        <div
          style={{
            position: 'sticky', top: 0, left: 0, zIndex: 4,
            background: 'var(--bg)',
            borderRight: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            height: HEADER_HEIGHT,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            gap: 8,
            padding: '0 12px 8px 16px',
            fontSize: 10.5, fontWeight: 600, color: 'var(--fg-muted)',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}
        >
          <span>Issue</span>
          {collapsibleCount > 0 && (
            <button
              type="button"
              onClick={handleToggleCollapseAll}
              className="btn btn-sm"
              title={isAnyCollapsed
                ? (groupedView ? 'Expand all assignees' : 'Expand all stories & epics')
                : (groupedView ? 'Collapse all assignees' : 'Collapse all stories & epics')}
              aria-label={isAnyCollapsed ? 'Expand all' : 'Collapse all'}
              style={{
                height: 22, padding: '0 8px', gap: 4,
                fontSize: 11, fontWeight: 500, letterSpacing: 0,
                textTransform: 'none', color: 'var(--fg)',
              }}
            >
              <Icon name={isAnyCollapsed ? 'chevronsRight' : 'chevronsLeft'} size={12} />
              {isAnyCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          )}
        </div>

        {/* Header — month + day strip */}
        <div
          style={{
            position: 'sticky', top: 0, zIndex: 3,
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
            height: HEADER_HEIGHT,
            width: timelineWidth,
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'relative', height: 26, width: timelineWidth }}>
            {months.map((m) => (
              <div
                key={m.key}
                style={{
                  position: 'absolute', left: m.left, width: m.width, height: 26,
                  display: 'flex', alignItems: 'center', padding: '0 8px',
                  fontSize: 11, fontWeight: 600, color: 'var(--fg)',
                  borderRight: '1px solid var(--border-muted)',
                  whiteSpace: 'nowrap', overflow: 'hidden',
                }}
              >
                {m.label}
              </div>
            ))}
          </div>
          <div
            style={{
              position: 'relative',
              height: HEADER_HEIGHT - 26,
              width: timelineWidth,
              borderTop: '1px solid var(--border-muted)',
            }}
          >
            {/* Milestone flag chips — sit above the day ticks (zIndex 2) so
                they read first; truncated so a long name doesn't overlap a
                neighbouring chip too aggressively. */}
            {milestoneMarks.map((mk) => (
              <PlannerMilestoneFlag key={`flag-${mk.id}`} mark={mk} todayIso={today} />
            ))}
            {ticks.map((t) => (
              <div
                key={t.day}
                title={t.holidayLabel}
                style={{
                  position: 'absolute',
                  left: t.left,
                  width: weekly ? dayPx * 7 : dayPx,
                  height: HEADER_HEIGHT - 26,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: t.isToday ? 700 : 500,
                  color: t.isToday
                    ? 'var(--accent)'
                    : t.isHoliday
                      ? 'var(--blocked)'
                      : t.isWeekend
                        ? 'var(--fg-faint)'
                        : 'var(--fg-muted)',
                  borderRight: '1px solid var(--border-muted)',
                  background: (t.isWeekend || t.isHoliday) && !weekly ? 'var(--bg-subtle)' : 'transparent',
                  lineHeight: 1.1,
                }}
              >
                <span style={{ fontSize: 9, color: 'var(--fg-faint)' }}>{t.secondaryLabel}</span>
                <span>{t.primaryLabel}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Body rows — hierarchy view (the default). The
            assignee-grouped view renders below in a separate branch. */}
        {!groupedView && tree.length === 0 && (
          <Fragment>
            <div style={{
              padding: '24px 16px', borderRight: '1px solid var(--border)',
              borderBottom: '1px solid var(--border-muted)',
              color: 'var(--fg-muted)', fontSize: 12,
              width: LABEL_COL_WIDTH,
            }}>
              No issues to plan in this window.
            </div>
            <div style={{
              borderBottom: '1px solid var(--border-muted)', width: timelineWidth,
            }} />
          </Fragment>
        )}
        {!groupedView && tree.map((row) => {
          const placed = schedule.scheduled.get(row.issue.key);
          const unscheduled = schedule.unscheduled.get(row.issue.key);
          const parentKey = parentMap.get(row.issue.key) ?? ROOT_PARENT_KEY;
          const isDragging = reorderDrag?.key === row.issue.key;
          const dropPosition = dropTarget?.key === row.issue.key
            ? dropTarget.position
            : undefined;
          // Universal-disable (2026-05-07): the row itself is "disabled
          // in plan" if its key is in plan.disabled (any issue type).
          // The "under a disabled ancestor" path is unchanged — that
          // grey treatment also applies to leaves whose own row carries
          // the toggle.
          const isDisabledInPlan = plan.disabled.includes(row.issue.key);
          const isUnderDisabledEpic = descendantsOfDisabled.has(row.issue.key);
          const isOrphanDep = orphanDepKeys.has(row.issue.key);
          return (
            <PlannerRow
              key={row.issue.key}
              issue={row.issue}
              parentKey={parentKey}
              tenant={tenant}
              workspace={workspace}
              range={range}
              dayPx={dayPx}
              timelineWidth={timelineWidth}
              weekly={weekly}
              ticks={ticks}
              todayOffset={todayOffset}
              milestoneMarks={milestoneMarks}
              depth={row.depth}
              hasChildren={row.hasChildren}
              isExpanded={row.isExpanded}
              onToggleExpand={row.hasChildren ? () => toggleNode(row.issue.key) : undefined}
              onPreviewPin={previewPin}
              onCommitPin={commitPin}
              onAssigneeChange={handleAssigneeChange}
              editingOpen={editingId === row.issue.key}
              onOpenEdit={() => setEditingId(row.issue.key)}
              onCloseEdit={() => setEditingId(null)}
              renderedByKey={renderedByKey}
              placedReason={placed?.reason}
              unscheduledReason={unscheduled}
              onStartReorder={(e) => startRowReorder(row.issue.key, e)}
              isDraggingForReorder={isDragging}
              dropIndicatorPosition={dropPosition}
              isDisabledInPlan={isDisabledInPlan}
              isUnderDisabledEpic={isUnderDisabledEpic}
              isOrphanDep={isOrphanDep}
              onToggleDisable={() => onToggleDisable(row.issue)}
              // Slice 7 — popover needs the override state and assignee
              // mutators. Team-on-Issue slice 4 (2026-05-07): team is now
              // read from `issue.teamId` and writes go through the BE via
              // `patchIssue`. We pass the values rather than the whole
              // `plan` so PlannerRow / popover stay memoisable on the
              // narrow inputs.
              hasAssigneeOverride={row.issue.key in plan.assigneeOverrides}
              teamId={row.issue.teamId}
              teams={teams}
              onClearAssigneeOverride={clearAssigneeOverride}
              onSetTeam={handleSetTeam}
              onClearTeam={handleClearTeam}
              placedAssigneeUserId={placed?.assigneeUserId ?? null}
            />
          );
        })}
        {/* Slice 10 (2026-05-07) — assignee-grouped body. One group per
            resolved user (alphabetical), Unscheduled pinned at the end.
            Container rows are excluded entirely; each leaf carries an
            "in <Parent Title>" chip after the title to keep the parent
            context visible without indentation. Drag-to-reorder priority
            is hidden in this view (see plan comments). */}
        {groupedView && userGroups.length === 0 && (
          <Fragment>
            <div style={{
              padding: '24px 16px', borderRight: '1px solid var(--border)',
              borderBottom: '1px solid var(--border-muted)',
              color: 'var(--fg-muted)', fontSize: 12,
              width: LABEL_COL_WIDTH,
            }}>
              No tasks to plan in this window.
            </div>
            <div style={{
              borderBottom: '1px solid var(--border-muted)', width: timelineWidth,
            }} />
          </Fragment>
        )}
        {groupedView && userGroups.map((group) => {
          const isCollapsed = collapsedUserGroups.has(group.key);
          return (
            <Fragment key={group.key}>
              <PlannerUserGroupRow
                group={group}
                isCollapsed={isCollapsed}
                onToggle={() => toggleUserGroup(group.key)}
                range={range}
                dayPx={dayPx}
                timelineWidth={timelineWidth}
                weekly={weekly}
                ticks={ticks}
                todayOffset={todayOffset}
                milestoneMarks={milestoneMarks}
              />
              {!isCollapsed && group.items.map((issue) => {
                const placed = schedule.scheduled.get(issue.key);
                const unscheduled = schedule.unscheduled.get(issue.key);
                const isDisabledInPlan = plan.disabled.includes(issue.key);
                const isUnderDisabledEpic = descendantsOfDisabled.has(issue.key);
                const isOrphanDep = orphanDepKeys.has(issue.key);
                // Resolve the parent (Epic or Story) for the
                // "in <Parent Title>" chip via the renderedByKey lookup
                // PlannerGantt already builds. A leaf with no parent in
                // the visible set passes a null chip — the row reads
                // identically to a hierarchy-mode root.
                const parent = issue.parent ? renderedByKey.get(issue.parent) : null;
                const chip = parent ? (
                  <span
                    title={`in ${parent.title}`}
                    style={{
                      flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center',
                      maxWidth: 160,
                      padding: '1px 6px', borderRadius: 4,
                      border: '1px solid var(--border)',
                      fontSize: 10,
                      color: 'var(--fg-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    in {parent.title.length > 24
                      ? `${parent.title.slice(0, 24)}…`
                      : parent.title}
                  </span>
                ) : null;
                return (
                  <PlannerRow
                    key={issue.key}
                    issue={issue}
                    parentKey={ROOT_PARENT_KEY}
                    tenant={tenant}
                    workspace={workspace}
                    range={range}
                    dayPx={dayPx}
                    timelineWidth={timelineWidth}
                    weekly={weekly}
                    ticks={ticks}
                    todayOffset={todayOffset}
                    depth={0}
                    hasChildren={false}
                    isExpanded
                    onPreviewPin={previewPin}
                    onCommitPin={commitPin}
                    onAssigneeChange={handleAssigneeChange}
                    editingOpen={editingId === issue.key}
                    onOpenEdit={() => setEditingId(issue.key)}
                    onCloseEdit={() => setEditingId(null)}
                    renderedByKey={renderedByKey}
                    placedReason={placed?.reason}
                    unscheduledReason={unscheduled}
                    onStartReorder={() => { /* disabled in grouped mode */ }}
                    isDraggingForReorder={false}
                    isDisabledInPlan={isDisabledInPlan}
                    isUnderDisabledEpic={isUnderDisabledEpic}
                    isOrphanDep={isOrphanDep}
                    onToggleDisable={() => onToggleDisable(issue)}
                    hasAssigneeOverride={issue.key in plan.assigneeOverrides}
                    teamId={issue.teamId}
                    teams={teams}
                    onClearAssigneeOverride={clearAssigneeOverride}
                    onSetTeam={handleSetTeam}
                    onClearTeam={handleClearTeam}
                    placedAssigneeUserId={placed?.assigneeUserId ?? null}
                    parentContextChip={chip}
                    hideReorderHandle
                    flattenIndent
                  />
                );
              })}
            </Fragment>
          );
        })}
        {/* Slice 8: Unscheduled rail. Always rendered last when there
            are any unscheduled rows. The header spans both grid
            columns; each rail row mirrors the regular row shape (label
            cell + timeline cell) but the timeline cell carries a
            reason chip + CTA instead of a bar. */}
        {unscheduledRows.length > 0 && (
          <UnscheduledRail
            rows={unscheduledRows}
            tenant={tenant}
            workspace={workspace}
            timelineWidth={timelineWidth}
            collapsed={unscheduledCollapsed}
            onToggleCollapsed={toggleUnscheduledCollapsed}
            editingId={editingId}
            onOpenEdit={(key) => setEditingId(key)}
            onCloseEdit={() => setEditingId(null)}
            // Popover wiring — same surface area as PlannerRow's so the
            // bar-edit popover renders identically when a
            // 'no-team-or-assignee' rail row opens it.
            plan={plan}
            teams={teams}
            onAssigneeChange={handleAssigneeChange}
            onClearAssigneeOverride={clearAssigneeOverride}
            onSetTeam={handleSetTeam}
            onClearTeam={handleClearTeam}
          />
        )}
      </div>
      {confirmDisable && (
        <DisableConfirmModal
          issue={confirmDisable.issue}
          affectedLeafCount={confirmDisable.affectedLeafCount}
          crossDependentCount={confirmDisable.crossDependents.length}
          onCancel={() => setConfirmDisable(null)}
          onConfirm={confirmDisableNow}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DisableConfirmModal — destructive-confirm pattern (Universal-disable
// 2026-05-07). Generalised from DisableEpicConfirmModal to handle any
// issue type. Copy phrasing reads "this Epic / Story / Task / Bug" by
// looking up the type label, so the modal stays specific without
// branching the component. Reuses the shared Modal shell +
// ModalHeader/Body/Footer; the action button gets the `btn-danger`
// treatment to match other destructive flows.
// ---------------------------------------------------------------------------

function DisableConfirmModal({
  issue, affectedLeafCount, crossDependentCount, onCancel, onConfirm,
}: {
  issue: Issue;
  affectedLeafCount: number;
  crossDependentCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const typeLabel = issue.type === 'E'
    ? 'Epic'
    : issue.type === 'S'
      ? 'Story'
      : issue.type === 'B'
        ? 'Bug'
        : 'Task';
  const isLeaf = issue.type === 'T' || issue.type === 'B';
  // The modal only fires when there's a real orphan risk, so the
  // headline is the orphan count. Cascade detail goes in a smaller
  // supporting line for containers — for leaves there's no cascade,
  // just the issue itself going away.
  return (
    <Modal onClose={onCancel} maxWidth={460} label={`Disable ${typeLabel} ${issue.key}`}>
      <ModalHeader title={`Disable ${typeLabel} "${issue.title}"?`} onClose={onCancel} />
      <ModalBody>
        <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.5 }}>
          {crossDependentCount === 1 ? (
            <>Disabling this {typeLabel.toLowerCase()} will leave <strong>1 other task</strong> blocked — it depends on something inside this {typeLabel.toLowerCase()}.</>
          ) : (
            <>Disabling this {typeLabel.toLowerCase()} will leave <strong>{crossDependentCount} other tasks</strong> blocked — they depend on something inside this {typeLabel.toLowerCase()}.</>
          )}
        </div>
        {!isLeaf && affectedLeafCount > 0 && (
          <div style={{
            marginTop: 8, fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5,
          }}>
            {affectedLeafCount === 1
              ? `Plus 1 task underneath that will drop out of the schedule along with it.`
              : `Plus ${affectedLeafCount} tasks underneath that will drop out of the schedule along with it.`}
          </div>
        )}
        <div style={{
          marginTop: 12, fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5,
        }}>
          The plan stays on your machine — disabling here doesn't change any backend data. Re-enable any time to restore.
        </div>
      </ModalBody>
      <ModalFooter>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onCancel} className="btn btn-sm">Cancel</button>
        <button
          type="button"
          onClick={onConfirm}
          className="btn btn-danger btn-sm"
        >
          <Icon name="power" size={13} />Disable {typeLabel}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// PlannerUserGroupRow — slice 10 (2026-05-07). Group header for the
// assignee-grouped Gantt view. Mirrors `issues-gantt.tsx`'s `GroupRow`
// visually (sticky-left label cell + timeline track with a faint
// aggregate bar), but local — the planner has no per-day assignee-load
// overlay (the workload heatmap pivot covers that). The "Unscheduled"
// pseudo-group renders the same chrome minus avatar / aggregate bar.
// ---------------------------------------------------------------------------

interface PlannerUserGroupRowProps {
  group: {
    key: string;
    items: Issue[];
    displayName: string;
  };
  isCollapsed: boolean;
  onToggle: () => void;
  range: DayRange;
  dayPx: number;
  timelineWidth: number;
  weekly: boolean;
  ticks: DayTick[];
  todayOffset: number;
  milestoneMarks?: PlannerMilestoneMark[];
}

function PlannerUserGroupRow({
  group, isCollapsed, onToggle,
  range, dayPx, timelineWidth, weekly, ticks, todayOffset, milestoneMarks,
}: PlannerUserGroupRowProps) {
  const isUnscheduled = group.key === UNSCHEDULED_GROUP_KEY;
  // Unscheduled never has an aggregate span (its leaves are by
  // definition unplaced). Real groups derive the span from their leaves'
  // placed dates.
  const span = useMemo(
    () => (isUnscheduled ? null : groupSpanFromIssues(group.items)),
    [isUnscheduled, group.items],
  );

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${group.displayName}`}
        style={{
          position: 'sticky', left: 0, zIndex: 2,
          display: 'flex', alignItems: 'center', gap: 8,
          height: GROUP_HEADER_HEIGHT,
          padding: '0 16px',
          background: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border-muted)',
          borderRight: '1px solid var(--border)',
          borderTop: 'none', borderLeft: 'none',
          cursor: 'pointer', textAlign: 'left',
          color: 'var(--fg)', fontSize: 12,
          width: LABEL_COL_WIDTH,
        }}
      >
        <Icon
          name={isCollapsed ? 'chevronRight' : 'chevronDown'}
          size={12}
          color="var(--fg-muted)"
        />
        {isUnscheduled ? (
          <Icon name="alert" size={14} color="var(--blocked)" />
        ) : (
          <Avatar name={group.displayName} size={20} />
        )}
        <span
          style={{
            fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0,
          }}
        >
          {isUnscheduled ? 'Unscheduled (no resolved assignee)' : group.displayName}
        </span>
        <span className="tnum" style={{ color: 'var(--fg-faint)' }}>
          {group.items.length}
        </span>
      </button>
      <div
        style={{
          position: 'relative',
          height: GROUP_HEADER_HEIGHT,
          width: timelineWidth,
          background: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border-muted)',
        }}
      >
        <PlannerBackdrop
          ticks={ticks}
          dayPx={dayPx}
          weekly={weekly}
          todayOffset={todayOffset}
          height={GROUP_HEADER_HEIGHT}
          milestoneMarks={milestoneMarks}
        />
        {span && (
          <div
            style={{
              position: 'absolute',
              top: 11,
              height: 10,
              left: (span.startDay - range.start) * dayPx,
              width: Math.max(2, (span.endDay - span.startDay + 1) * dayPx),
              background: 'var(--fg-faint)',
              borderRadius: 3,
              opacity: 0.55,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// PlannerRow — single issue row. Mirrors IssuesGantt.IssueRow's structure,
// but every drag commits to the planner store instead of the issues store.
// ---------------------------------------------------------------------------

interface RowChromeProps {
  range: DayRange;
  dayPx: number;
  timelineWidth: number;
  weekly: boolean;
  ticks: DayTick[];
  todayOffset: number;
  milestoneMarks?: PlannerMilestoneMark[];
}

interface PlannerRowProps extends RowChromeProps {
  issue: Issue;
  /** Resolved parent key for hit-test data attribute (slice 5). Roots
   *  pass `ROOT_PARENT_KEY` so root-vs-root reorder hit-tests cleanly. */
  parentKey: string;
  tenant: string;
  workspace: string;
  depth?: number;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onPreviewPin: (key: string, dates: { startDate: string; endDate: string }) => void;
  onCommitPin: (key: string, dates: { startDate: string; endDate: string }) => void;
  onAssigneeChange: (key: string, userId: string | null) => void;
  editingOpen: boolean;
  onOpenEdit: () => void;
  onCloseEdit: () => void;
  /** Map of post-scheduler issues for container-bar derivation. */
  renderedByKey: Map<string, Issue>;
  /** Reason the scheduler placed this leaf — drives the lock/pin icon. */
  placedReason?: ScheduledBar['reason'];
  /** Reason the leaf was rejected — surfaces a small chip in slice 4. */
  unscheduledReason?: UnscheduledReason;
  /** Slice 5: mousedown on the grip handle starts a row reorder gesture. */
  onStartReorder: (e: React.MouseEvent) => void;
  /** Slice 5: row dimmed while it's the active drag source. */
  isDraggingForReorder: boolean;
  /** Slice 5: when set, draws the blue indicator line on this side of
   *  the row. Undefined means this row isn't the current drop target. */
  dropIndicatorPosition?: 'above' | 'below';
  /** Universal-disable (2026-05-07): this row's own key is in
   *  `plan.disabled`. Renders the power toggle in its "off" (red)
   *  state and dims the label cell. Generalised from Epic-only. */
  isDisabledInPlan?: boolean;
  /** This row is somewhere under a disabled ancestor. Dims the
   *  label cell and suppresses any bar (the scheduler already
   *  excluded leaves; this also covers Story / Bug / Task
   *  descendants of any disabled root, not just Epics). */
  isUnderDisabledEpic?: boolean;
  /** Still-enabled Task that depends on a leaf inside a disabled
   *  subtree. Renders the small "orphan dep" chip after the title. */
  isOrphanDep?: boolean;
  /** Universal-disable (2026-05-07): present on every row. Click
   *  toggles the disabled state for this issue (with the confirm
   *  modal lifted to PlannerGantt for non-zero affected counts). */
  onToggleDisable: () => void;
  // Slice 7 — popover state + mutators. All optional from the row's
  // perspective: containers (Story/Epic) won't open the popover, so the
  // values are still inert when the row isn't a leaf.
  /** True iff `key in plan.assigneeOverrides`. Used to decide whether
   *  the popover surfaces "Clear assignee" / "Revert to default" and
   *  whether to show the "Plan override" header chip. */
  hasAssigneeOverride: boolean;
  /** UUID of the team attached to this issue (BE-persisted via
   *  `Issue.teamId`). Team-on-Issue slice 4 (2026-05-07): replaces the
   *  pre-slice plan-only slug. Drives the popover's Team section AND
   *  the bar's team-greedy left border. */
  teamId: string | undefined;
  /** Active workspace teams from useTeams() — passed in so PlannerGantt
   *  owns the single subscribe to that context. */
  teams: Team[];
  /** Drop the override entry — falls back to BE-canonical assignee. */
  onClearAssigneeOverride: (key: string) => void;
  /** Attach a team to this leaf via `useIssues().patchIssue` (BE write). */
  onSetTeam: (key: string, teamId: string) => void;
  /** Detach the team via `useIssues().patchIssue({ teamId: null })`. */
  onClearTeam: (key: string) => void;
  /** Resolved assignee from the scheduler output (override > BE > none).
   *  Drives the team-greedy hint in the popover: when null AND a team is
   *  attached, the bar will be picked greedy from that team. */
  placedAssigneeUserId: string | null;
  /** Slice 10 (2026-05-07) — small "in <Parent Title>" chip rendered
   *  inside the label cell after the title. Only set in the
   *  assignee-grouped view, where indentation no longer carries the
   *  parent context. Hierarchy mode passes `undefined` so the row reads
   *  identically to before. */
  parentContextChip?: React.ReactNode;
  /** Slice 10 — when true, the drag-handle / chevron are suppressed.
   *  Reorder priority is hidden in assignee-grouped mode (see plan
   *  comments). The disable toggle / bar-edit / pin / popover all stay
   *  unchanged. */
  hideReorderHandle?: boolean;
  /** Slice 10 — flatten the depth indent (used by the hierarchy view).
   *  Grouped mode wants every leaf flush-left under its group header
   *  regardless of its native depth in the Epic/Story tree. */
  flattenIndent?: boolean;
}

function PlannerRow({
  issue, parentKey, tenant, workspace,
  range, dayPx, timelineWidth, weekly, ticks, todayOffset, milestoneMarks,
  depth = 0, hasChildren = false, isExpanded = true, onToggleExpand,
  onPreviewPin, onCommitPin, onAssigneeChange,
  editingOpen, onOpenEdit, onCloseEdit, renderedByKey,
  placedReason, unscheduledReason,
  onStartReorder, isDraggingForReorder, dropIndicatorPosition,
  isDisabledInPlan = false, isUnderDisabledEpic = false,
  isOrphanDep = false, onToggleDisable,
  hasAssigneeOverride, teamId, teams,
  onClearAssigneeOverride, onSetTeam, onClearTeam,
  placedAssigneeUserId,
  parentContextChip,
  hideReorderHandle = false,
  flattenIndent = false,
}: PlannerRowProps) {
  const editable = issue.type === 'T' || issue.type === 'B';
  // Universal-disable: descendants of a disabled ancestor don't render
  // a bar (scheduler skipped leaves; containers naturally have no
  // rollup). A row that's itself disabled also suppresses its bar.
  const suppressBar = isUnderDisabledEpic || isDisabledInPlan;
  const bar = suppressBar ? null : barFor(issue, renderedByKey);
  const { getProjectById } = useProjects();
  const projectSlug = getProjectById(issue.projectId)?.slug ?? '';
  const issueHref = `/${tenant}/${workspace}/${projectSlug}/issue/${issue.key}`;

  // Slice 10: assignee-grouped view flattens the indent so each leaf
  // sits flush under its group header rather than carrying its native
  // depth in the Epic/Story tree (which would imply a hierarchy that
  // isn't shown).
  const indent = flattenIndent ? 0 : depth * 16;

  const labelStyle: CSSProperties = {
    position: 'sticky', left: 0, zIndex: 1,
    display: 'flex', alignItems: 'center', gap: 8,
    height: ROW_HEIGHT,
    padding: `0 16px 0 ${4 + indent}px`,
    background: 'var(--bg)',
    borderBottom: '1px solid var(--border-muted)',
    borderRight: '1px solid var(--border)',
    width: LABEL_COL_WIDTH,
    minWidth: 0,
  };

  // Drag interactions: same modes as IssuesGantt — move / resize-start /
  // resize-end. The persistence target is the planner store via
  // onPreviewPin / onCommitPin instead of useIssues().updateIssue.
  const startBarDrag = (mode: 'move' | 'resize-start' | 'resize-end', e: React.MouseEvent) => {
    if (!bar || !editable) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = bar.startDay;
    const origEnd = bar.endDay;
    let didDrag = false;
    let lastStart = origStart;
    let lastEnd = origEnd;
    const onMove = (ev: MouseEvent) => {
      if (!didDrag && (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3)) {
        didDrag = true;
      }
      if (!didDrag) return;
      const deltaDays = Math.round((ev.clientX - startX) / dayPx);
      let newStart = origStart;
      let newEnd = origEnd;
      if (mode === 'move') {
        newStart = origStart + deltaDays;
        newEnd = origEnd + deltaDays;
      } else if (mode === 'resize-start') {
        newStart = Math.min(origEnd, origStart + deltaDays);
      } else if (mode === 'resize-end') {
        newEnd = Math.max(origStart, origEnd + deltaDays);
      }
      lastStart = newStart;
      lastEnd = newEnd;
      onPreviewPin(issue.key, {
        startDate: dayToIso(newStart),
        endDate: dayToIso(newEnd),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // No drag → click on the bar body opens the edit popover.
      if (!didDrag && mode === 'move') {
        onOpenEdit();
        return;
      }
      if (didDrag) {
        onCommitPin(issue.key, {
          startDate: dayToIso(lastStart),
          endDate: dayToIso(lastEnd),
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Click-and-drag on an empty (unscheduled) row to create a span. Same
  // gesture as IssuesGantt — anchor day on mousedown, expand by drag,
  // commit a pin on release.
  const startCreateDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (bar || !editable) return;
    e.preventDefault();
    const trackRect = e.currentTarget.getBoundingClientRect();
    const anchorDay = range.start + Math.floor((e.clientX - trackRect.left) / dayPx);
    let lastStart = anchorDay;
    let lastEnd = anchorDay;
    onPreviewPin(issue.key, { startDate: dayToIso(anchorDay), endDate: dayToIso(anchorDay) });
    const onMove = (ev: MouseEvent) => {
      const day = range.start + Math.floor((ev.clientX - trackRect.left) / dayPx);
      const s = Math.min(anchorDay, day);
      const ed = Math.max(anchorDay, day);
      lastStart = s;
      lastEnd = ed;
      onPreviewPin(issue.key, { startDate: dayToIso(s), endDate: dayToIso(ed) });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      onCommitPin(issue.key, {
        startDate: dayToIso(lastStart),
        endDate: dayToIso(lastEnd),
      });
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Reason chip text, slice 4 minimal. Slice 8 will move these to a
  // dedicated rail.
  const reasonChipText = (() => {
    if (!unscheduledReason) return null;
    switch (unscheduledReason) {
      case 'no-team-or-assignee': return 'Pick a team';
      case 'no-effort': return 'No estimate';
      case 'team-empty': return 'Team empty';
      case 'blocked-by-disabled-epic': return 'Blocked';
      case 'cycle': return 'Dep cycle';
      default: return null;
    }
  })();

  // Greyed treatments for the disabled ecosystem. The disabled row
  // itself sits at 0.55 (still readable so the toggle is legible);
  // descendants drop to 0.5 so the visual weight clearly trails off.
  // Drag opacity (0.5) layers compositionally — both can apply.
  // Universal-disable (2026-05-07): the "self" treatment now applies
  // to any disabled row, not just Epics.
  const labelOpacity = isDraggingForReorder
    ? 0.5
    : isDisabledInPlan
      ? 0.55
      : isUnderDisabledEpic
        ? 0.5
        : 1;

  return (
    <>
      <div
        data-planner-row-key={issue.key}
        data-planner-parent-key={parentKey}
        style={{
          ...labelStyle,
          opacity: labelOpacity,
        }}
      >
        {/* Slice 5: drag handle. mousedown on this starts the row reorder
            gesture; stopPropagation in the parent's startRowReorder keeps
            it from also triggering the bar / track mousedown. Six-dot
            grip uses the existing 'drag' icon in icons.tsx (verified).
            Slice 10 (2026-05-07): suppressed entirely in assignee-grouped
            mode — within-group reorder doesn't have a clean semantic for
            the flat workspace-wide priority list. */}
        {!hideReorderHandle && (
          <button
            type="button"
            aria-label="Reorder row"
            onMouseDown={onStartReorder}
            onClick={(e) => e.preventDefault()}
            style={{
              flexShrink: 0,
              width: 14, height: 18,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', padding: 0,
              cursor: isDraggingForReorder ? 'grabbing' : 'grab',
              color: 'var(--fg-faint)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg-muted)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-faint)'; }}
          >
            <Icon name="drag" size={12} />
          </button>
        )}
        {hideReorderHandle ? null : hasChildren ? (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            style={{
              flexShrink: 0,
              width: 18, height: 18,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', borderRadius: 3,
              cursor: 'pointer', color: 'var(--fg-muted)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={12} />
          </button>
        ) : (
          <span style={{ flexShrink: 0, width: 18 }} aria-hidden="true" />
        )}
        <TypeChip type={issue.type} />
        <Link
          to={issueHref}
          style={{ textDecoration: 'none', color: 'inherit' }}
          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
        >
          <IssueId id={issue.key} />
        </Link>
        <span
          style={{
            flex: 1, minWidth: 0, fontSize: 12.5,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--fg)',
          }}
        >
          {issue.title}
        </span>
        {/* Slice 10 (2026-05-07): "in <Parent Title>" chip. Only set in
            assignee-grouped mode; hierarchy mode passes undefined and the
            parent context is conveyed by indentation. */}
        {parentContextChip}
        {reasonChipText && (
          <span style={{
            fontSize: 10, fontWeight: 600,
            padding: '1px 6px', borderRadius: 8,
            background: 'var(--bg-subtle)', color: 'var(--fg-muted)',
            flexShrink: 0,
          }}>
            {reasonChipText}
          </span>
        )}
        {/* Slice 6: orphan-dep chip for still-enabled Tasks whose
            dependsOn predecessor lives inside a disabled Epic. Tooltip
            spells out the recovery options so the user doesn't have to
            guess which Epic to re-enable. */}
        {isOrphanDep && (
          <span
            title="Depends on a task inside a disabled Epic. Re-enable the Epic or remove the dependency."
            style={{
              fontSize: 10, fontWeight: 600,
              padding: '2px 6px', borderRadius: 8,
              background: 'var(--blocked-bg)', color: 'var(--blocked)',
              flexShrink: 0,
            }}
          >
            orphan dep
          </span>
        )}
        {/* Universal-disable (2026-05-07): per-row disable toggle.
            Lives on every row (Epic / Story / Task / Bug) — was
            Epic-only pre-rename. We use the `power` icon (icons.tsx
            ships no `eyeOff`); on/off semantics map cleanly and the
            visual reads as a switch. Default (enabled) renders in
            --positive (green); disabled in --blocked (red).
            stopPropagation on mousedown keeps the row-reorder grip
            from also firing. */}
        <button
          type="button"
          aria-label={isDisabledInPlan ? 'Enable in this plan' : 'Disable in this plan'}
          title={isDisabledInPlan ? 'Enable in this plan' : 'Disable in this plan'}
          aria-pressed={isDisabledInPlan}
          onMouseDown={(e) => { e.stopPropagation(); }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleDisable();
          }}
          style={{
            flexShrink: 0,
            width: 22, height: 22,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: isDisabledInPlan ? 'var(--blocked-bg)' : 'var(--positive-bg)',
            border: '1px solid',
            borderColor: isDisabledInPlan ? 'var(--blocked)' : 'var(--positive)',
            borderRadius: 4,
            padding: 0, cursor: 'pointer',
            color: isDisabledInPlan ? 'var(--blocked)' : 'var(--positive)',
          }}
          onMouseEnter={(e) => {
            // Hover slightly darkens the surface; we keep the colour
            // role (red vs green) so the on/off state stays readable
            // through the hover state.
            e.currentTarget.style.background = isDisabledInPlan
              ? 'var(--blocked-bg)'
              : 'var(--bg-subtle)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isDisabledInPlan
              ? 'var(--blocked-bg)'
              : 'var(--positive-bg)';
          }}
        >
          <Icon name="power" size={12} />
        </button>
        {dropIndicatorPosition && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0, right: 0, height: 2,
              top: dropIndicatorPosition === 'above' ? -1 : 'auto',
              bottom: dropIndicatorPosition === 'below' ? -1 : 'auto',
              background: 'var(--accent)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        )}
      </div>
      <div
        // Universal-disable (2026-05-07): descendants of a disabled
        // ancestor — and the disabled row itself — can't be pinned
        // via click-drag because there's nothing to schedule until
        // re-enabled. We disable the create-on-empty handler in that
        // case (no crosshair cursor either, since the cell isn't
        // actionable).
        onMouseDown={!bar && editable && !suppressBar ? startCreateDrag : undefined}
        style={{
          position: 'relative',
          height: ROW_HEIGHT,
          width: timelineWidth,
          borderBottom: '1px solid var(--border-muted)',
          background: 'var(--bg)',
          cursor: !bar && editable && !suppressBar ? 'crosshair' : undefined,
          opacity: isUnderDisabledEpic || isDisabledInPlan ? 0.5 : 1,
        }}
      >
        <PlannerBackdrop
          ticks={ticks}
          dayPx={dayPx}
          weekly={weekly}
          todayOffset={todayOffset}
          height={ROW_HEIGHT}
          milestoneMarks={milestoneMarks}
        />
        {bar && (
          <PlannerBar
            issue={issue}
            bar={bar}
            range={range}
            dayPx={dayPx}
            editable={editable}
            placedReason={placedReason}
            // Slice 7 visual indicators. The override star sits next to
            // the existing lock/pin icon at the bar's left.
            // Team-on-Issue slice 5 (2026-05-07): the team-greedy
            // marker is now the loud accent-subtle bar + leading
            // "team: <Name>" chip (replacing the slice-7 dotted left
            // border). It triggers only when the issue itself has no
            // assignee, a team is attached, and the scheduler placed
            // someone from the team (and there's no plan-side override
            // — override is the more specific signal). Team name is
            // resolved here so PlannerBar stays free of the teams
            // context.
            hasOverride={hasAssigneeOverride}
            teamGreedy={
              !issue.assigneeUserId
              && !!teamId
              && placedAssigneeUserId != null
              && !hasAssigneeOverride
            }
            teamName={teamId ? teams.find((t) => t.id === teamId)?.name ?? null : null}
            onMouseDownMove={editable ? (e) => startBarDrag('move', e) : undefined}
            onMouseDownResizeStart={editable ? (e) => startBarDrag('resize-start', e) : undefined}
            onMouseDownResizeEnd={editable ? (e) => startBarDrag('resize-end', e) : undefined}
            onClickReadOnly={!editable ? () => onOpenEdit() : undefined}
          />
        )}
        {editingOpen && bar && (
          <PlannerBarEditPopover
            issue={issue}
            tenant={tenant}
            workspace={workspace}
            left={(bar.startDay - range.start) * dayPx + 1}
            hasAssigneeOverride={hasAssigneeOverride}
            teamId={teamId}
            teams={teams}
            placedAssigneeUserId={placedAssigneeUserId}
            onAssigneeChange={(userId) => onAssigneeChange(issue.key, userId)}
            onClearAssigneeOverride={() => onClearAssigneeOverride(issue.key)}
            onSetTeam={(uuid) => onSetTeam(issue.key, uuid)}
            onClearTeam={() => onClearTeam(issue.key)}
            onClose={onCloseEdit}
          />
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// UnscheduledRail — slice 8. The bottom-of-gantt rail of leaves the
// scheduler couldn't place. Each row mirrors the regular row's label
// shape (TypeChip + IssueId + title) but the timeline cell carries a
// single reason chip + a one-line CTA instead of a bar.
//
// Reuse:
//   - The rail integrates into the same CSS grid as the gantt body
//     (label col + timeline col), so the columns line up.
//   - For 'no-team-or-assignee' rows the CTA opens the same
//     PlannerBarEditPopover the regular row uses — anchored at left=0
//     of the timeline cell since there's no bar to anchor against.
// ---------------------------------------------------------------------------

interface UnscheduledRailProps {
  rows: Array<{ issue: Issue; reason: UnscheduledReason }>;
  tenant: string;
  workspace: string;
  timelineWidth: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  editingId: string | null;
  onOpenEdit: (key: string) => void;
  onCloseEdit: () => void;
  plan: PlannerState;
  teams: Team[];
  onAssigneeChange: (key: string, userId: string | null) => void;
  onClearAssigneeOverride: (key: string) => void;
  /** Team-on-Issue slice 4 — BE write via `useIssues().patchIssue`. */
  onSetTeam: (key: string, teamId: string) => void;
  onClearTeam: (key: string) => void;
}

function UnscheduledRail({
  rows, tenant, workspace, timelineWidth,
  collapsed, onToggleCollapsed,
  editingId, onOpenEdit, onCloseEdit,
  plan, teams,
  onAssigneeChange, onClearAssigneeOverride,
  onSetTeam, onClearTeam,
}: UnscheduledRailProps) {
  return (
    <>
      {/* Header — spans both grid columns via gridColumn: 1 / -1 so the
          chevron + count row reads as one unit at the seam between the
          last priority row and the rail. */}
      <div
        style={{
          gridColumn: '1 / -1',
          background: 'var(--bg-subtle)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border-muted)',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 16px',
        }}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand unscheduled rail' : 'Collapse unscheduled rail'}
          aria-expanded={!collapsed}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', padding: '2px 6px',
            borderRadius: 4, cursor: 'pointer', color: 'var(--fg)',
            fontSize: 12, fontWeight: 600,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={12} />
          <span>Unscheduled</span>
          <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>({rows.length})</span>
        </button>
      </div>
      {!collapsed && rows.map(({ issue, reason }) => (
        <UnscheduledRow
          key={issue.key}
          issue={issue}
          reason={reason}
          tenant={tenant}
          workspace={workspace}
          timelineWidth={timelineWidth}
          editingOpen={editingId === issue.key}
          onOpenEdit={() => onOpenEdit(issue.key)}
          onCloseEdit={onCloseEdit}
          hasAssigneeOverride={issue.key in plan.assigneeOverrides}
          teamId={issue.teamId}
          teams={teams}
          onAssigneeChange={(userId) => onAssigneeChange(issue.key, userId)}
          onClearAssigneeOverride={() => onClearAssigneeOverride(issue.key)}
          onSetTeam={(uuid) => onSetTeam(issue.key, uuid)}
          onClearTeam={() => onClearTeam(issue.key)}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// UnscheduledRow — single rail row. Two grid cells (label + timeline).
// The timeline cell carries the reason chip + CTA. Click on the CTA
// area opens the popover or navigates per reason.
// ---------------------------------------------------------------------------

interface UnscheduledRowProps {
  issue: Issue;
  reason: UnscheduledReason;
  tenant: string;
  workspace: string;
  timelineWidth: number;
  editingOpen: boolean;
  onOpenEdit: () => void;
  onCloseEdit: () => void;
  hasAssigneeOverride: boolean;
  /** UUID of the team attached to this issue (BE-persisted). */
  teamId: string | undefined;
  teams: Team[];
  onAssigneeChange: (userId: string | null) => void;
  onClearAssigneeOverride: () => void;
  onSetTeam: (teamId: string) => void;
  onClearTeam: () => void;
}

function UnscheduledRow({
  issue, reason, tenant, workspace, timelineWidth,
  editingOpen, onOpenEdit, onCloseEdit,
  hasAssigneeOverride, teamId, teams,
  onAssigneeChange, onClearAssigneeOverride,
  onSetTeam, onClearTeam,
}: UnscheduledRowProps) {
  const { getProjectById } = useProjects();
  const projectSlug = getProjectById(issue.projectId)?.slug ?? '';
  const issueHref = `/${tenant}/${workspace}/${projectSlug}/issue/${issue.key}`;
  // For the "team-empty" CTA we link out to the attached team's detail
  // page. The router uses team slugs in URLs, so resolve UUID → slug here.
  const attachedTeam = teamId ? teams.find((t) => t.id === teamId) ?? null : null;
  const teamHref = attachedTeam
    ? `/${tenant}/${workspace}/teams/${attachedTeam.slug}`
    : null;

  // Reason → {chip, cta} mapping. Chips read as the failure mode; CTAs
  // are the recovery action — link or popover.
  const chip = (() => {
    switch (reason) {
      case 'no-team-or-assignee': return 'No assignee';
      case 'no-effort': return 'No estimate';
      case 'team-empty': return 'Team empty';
      case 'blocked-by-disabled-epic': return 'Blocked';
      case 'cycle': return 'Dep cycle';
    }
  })();

  // CTA renderer. 'no-team-or-assignee' uses a button that opens the
  // popover; the others either link to the issue / team detail or
  // surface plain text (for issues the user has to fix elsewhere).
  const renderCta = (): React.ReactNode => {
    switch (reason) {
      case 'no-team-or-assignee':
        return (
          <button
            type="button"
            onClick={onOpenEdit}
            className="btn btn-sm"
            style={{
              background: 'transparent',
              borderColor: 'var(--border)',
            }}
          >
            Pick a team or assignee
          </button>
        );
      case 'no-effort':
        return (
          <Link to={issueHref} className="btn btn-sm" style={{ textDecoration: 'none' }}>
            Set an effort estimate
          </Link>
        );
      case 'team-empty':
        return teamHref ? (
          <Link to={teamHref} className="btn btn-sm" style={{ textDecoration: 'none' }}>
            Add members to the team
          </Link>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            Add members to the attached team.
          </span>
        );
      case 'blocked-by-disabled-epic':
        return (
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            Re-enable the Epic, or remove the dep.
          </span>
        );
      case 'cycle':
        return (
          <Link to={issueHref} className="btn btn-sm" style={{ textDecoration: 'none' }}>
            Resolve the dependency cycle
          </Link>
        );
    }
  };

  return (
    <>
      {/* Label cell — mirrors PlannerRow's label cell visual but without
          the drag-handle / chevron / disable-Epic toggle. The rail is a
          read-only inventory; reorder doesn't apply here. */}
      <div
        style={{
          position: 'sticky', left: 0, zIndex: 1,
          display: 'flex', alignItems: 'center', gap: 8,
          height: ROW_HEIGHT,
          padding: '0 16px 0 8px',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border-muted)',
          borderRight: '1px solid var(--border)',
          width: LABEL_COL_WIDTH,
          minWidth: 0,
        }}
      >
        <TypeChip type={issue.type} />
        <Link
          to={issueHref}
          style={{ textDecoration: 'none', color: 'inherit' }}
          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
        >
          <IssueId id={issue.key} />
        </Link>
        <span
          style={{
            flex: 1, minWidth: 0, fontSize: 12.5,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--fg)',
          }}
        >
          {issue.title}
        </span>
      </div>
      {/* Timeline cell — reason chip + CTA. Anchored to the left so the
          rail's actionable content sits directly to the right of the
          label column, mirroring where a regular row's bar would start
          for an issue scheduled at the window's earliest day. */}
      <div
        style={{
          position: 'relative',
          height: ROW_HEIGHT,
          width: timelineWidth,
          borderBottom: '1px solid var(--border-muted)',
          background: 'var(--bg)',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 12px',
        }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          fontSize: 10, fontWeight: 600,
          padding: '2px 6px', borderRadius: 8,
          background: 'var(--blocked-bg)', color: 'var(--blocked)',
          flexShrink: 0,
        }}>
          {chip}
        </span>
        <span style={{ display: 'inline-flex', flexShrink: 0 }}>
          {renderCta()}
        </span>
        {/* Slice 7 popover — same component as PlannerRow uses, anchored
            at the timeline cell's left edge since the rail row has no
            bar. Only mounts for 'no-team-or-assignee' (the only rail
            row whose CTA opens the popover). */}
        {editingOpen && reason === 'no-team-or-assignee' && (
          <PlannerBarEditPopover
            issue={issue}
            tenant={tenant}
            workspace={workspace}
            left={12}
            hasAssigneeOverride={hasAssigneeOverride}
            teamId={teamId}
            teams={teams}
            placedAssigneeUserId={null}
            onAssigneeChange={onAssigneeChange}
            onClearAssigneeOverride={onClearAssigneeOverride}
            onSetTeam={onSetTeam}
            onClearTeam={onClearTeam}
            onClose={onCloseEdit}
          />
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// PlannerBar — bar visual. Carries the lock/pin icon + tooltip.
// ---------------------------------------------------------------------------

interface PlannerBarProps {
  issue: Issue;
  bar: BarSpec;
  range: DayRange;
  dayPx: number;
  editable: boolean;
  placedReason?: ScheduledBar['reason'];
  /** Slice 7: this leaf has an assignee override in the plan. Shows a
   *  star marker next to any existing lock/pin icon. */
  hasOverride?: boolean;
  /** Team-on-Issue slice 5 (2026-05-07): this leaf has no resolved
   *  assignee but a team is attached AND the scheduler greedy-picked a
   *  member from it. Triggers the loud accent-subtle bar treatment +
   *  the leading "team: <Name>" chip. Replaces the slice-7 dotted
   *  left-border treatment. */
  teamGreedy?: boolean;
  /** Team-on-Issue slice 5: resolved team name for the leading
   *  in-bar chip when `teamGreedy` is true. Resolved by the parent via
   *  `useTeams().getTeam(issue.teamId)`; UUIDs never render so missing
   *  team falls back to the bare "team" label without a name. */
  teamName?: string | null;
  onMouseDownMove?: (e: React.MouseEvent) => void;
  onMouseDownResizeStart?: (e: React.MouseEvent) => void;
  onMouseDownResizeEnd?: (e: React.MouseEvent) => void;
  onClickReadOnly?: () => void;
}

function PlannerBar({
  issue, bar, range, dayPx, editable, placedReason,
  hasOverride = false, teamGreedy = false, teamName = null,
  onMouseDownMove, onMouseDownResizeStart, onMouseDownResizeEnd, onClickReadOnly,
}: PlannerBarProps) {
  // Fixed bar palette per reason — distinct from the issue-status bar
  // colour used in IssuesGantt. The planner is a what-if surface, so we
  // surface "this is frozen" / "this is pinned" / "this is greedy" first
  // and let the user open the row to drill in.
  const isFrozen = placedReason === 'started' || placedReason === 'pinned';
  const reasonTooltip = placedReason === 'started'
    ? 'Currently in flight — frozen at issue dates.'
    : placedReason === 'pinned'
      ? 'Pinned to these dates. Drag to repin, or reset to revert.'
      : null;

  // Slice 5 (2026-05-07): when the bar is team-greedy, surface that in
  // the tooltip — the loud styling gives the at-a-glance read, the
  // tooltip carries the precise framing (team name + provisional
  // placement). Falls in front of the "drag to move" hint when both
  // would apply.
  const teamGreedyTooltip = teamGreedy
    ? `Team-greedy placement — assignee picked from ${teamName ? `team ${teamName}` : 'team'}.`
    : null;

  const tooltipHead = `${issue.key} · ${issue.title}`;
  const tooltipDates = `${issue.startDate ?? '—'} → ${issue.endDate ?? '—'}`;
  const tooltipExtra = [reasonTooltip, teamGreedyTooltip].filter(Boolean).join('\n');
  const tooltipBody = editable
    ? tooltipExtra
      ? `${tooltipHead}\n${tooltipDates}\n${tooltipExtra}`
      : `${tooltipHead}\n${tooltipDates}\nDrag to move, drag edges to resize`
    : `${tooltipHead}\nRolled up from descendants`;

  // Background: greedy → accent-subtle, pinned/started → bg-muted with a
  // border to read as "locked". Keeps the planner visually distinct from
  // the status-coloured planning gantt.
  const bg = !editable
    ? 'var(--bg-muted)'
    : isFrozen
      ? 'var(--bg-muted)'
      : 'var(--accent-subtle)';
  const borderColor = !editable
    ? 'var(--fg-faint)'
    : isFrozen
      ? 'var(--fg-faint)'
      : 'var(--accent-border)';
  const fg = !editable
    ? 'var(--fg-muted)'
    : isFrozen
      ? 'var(--fg)'
      : 'var(--accent)';

  // Team-on-Issue slice 5 (2026-05-07): replaced the slice-7 dotted
  // left-border treatment with an inline `team: <Name>` chip leading
  // the title (rendered below in the bar body). The bar background
  // already uses `--accent-subtle` + `--accent-border` from the
  // editable / not-frozen branch above — that satisfies the "loud"
  // requirement without further per-state styling. Suppressed when the
  // bar is dashed for missing dates or when the override star is
  // showing (override is the more specific signal — a team-greedy
  // chip alongside it would read as noise).
  const showTeamGreedyChip = teamGreedy && bar.hasStart && bar.hasEnd && !hasOverride;

  return (
    <div
      title={tooltipBody}
      onMouseDown={onMouseDownMove}
      onClick={onClickReadOnly ? (e) => { e.stopPropagation(); onClickReadOnly(); } : undefined}
      style={{
        position: 'absolute',
        top: 6,
        height: ROW_HEIGHT - 12,
        left: (bar.startDay - range.start) * dayPx + 1,
        width: Math.max(dayPx - 2, (bar.endDay - bar.startDay + 1) * dayPx - 2),
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 4,
        display: 'flex', alignItems: 'center',
        padding: '0 6px',
        gap: 6,
        fontSize: 11,
        color: fg,
        fontWeight: 600,
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        opacity: editable ? (bar.hasStart && bar.hasEnd ? 1 : 0.85) : 0.7,
        borderStyle: editable && !(bar.hasStart && bar.hasEnd) ? 'dashed' : 'solid',
        cursor: editable ? 'grab' : 'pointer',
        userSelect: 'none',
      }}
    >
      {editable && onMouseDownResizeStart && (
        <div
          onMouseDown={onMouseDownResizeStart}
          aria-label="Resize start"
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 6,
            cursor: 'col-resize',
          }}
        />
      )}
      {placedReason === 'started' && (
        <Icon name="lock" size={11} color={fg} />
      )}
      {placedReason === 'pinned' && (
        <Icon name="pin" size={11} color={fg} />
      )}
      {/* Slice 7: assignee-override marker. Sits next to lock/pin via the
          shared 6px gap on the bar's flexbox; cumulative when both the
          bar is pinned AND has an override. */}
      {hasOverride && (
        <Icon name="star" size={11} color={fg} />
      )}
      {/* Team-on-Issue slice 5 (2026-05-07): leading "team: <Name>" chip
          when the bar is a team-greedy placement. Sits inside the bar's
          flexbox before the title — both can ellipsis; the chip uses
          `flex: 0 1 auto` (shrinks but doesn't grow) so the title stays
          the dominant element. UUIDs never render — falls back to the
          bare "team" label when name resolution fails. */}
      {showTeamGreedyChip && (
        <span
          style={{
            flex: '0 1 auto',
            minWidth: 0,
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--accent-active)',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            pointerEvents: 'none',
          }}
        >
          {teamName ? `team: ${teamName}` : 'team'}
        </span>
      )}
      <span style={{
        flex: '1 1 auto', minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none',
      }}>
        {issue.title}
      </span>
      {editable && onMouseDownResizeEnd && (
        <div
          onMouseDown={onMouseDownResizeEnd}
          aria-label="Resize end"
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
            cursor: 'col-resize',
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlannerBackdrop — vertical week-start dividers, weekend / holiday shading,
// and the today marker. Equivalent to IssuesGantt's `TimelineBackdrop` but
// local so we don't expand that component's API surface.
// ---------------------------------------------------------------------------

function PlannerBackdrop({
  ticks, dayPx, weekly, todayOffset, height, milestoneMarks,
}: {
  ticks: DayTick[];
  dayPx: number;
  weekly: boolean;
  todayOffset: number;
  height: number;
  milestoneMarks?: PlannerMilestoneMark[];
}) {
  return (
    <>
      {!weekly && ticks.map((t) =>
        t.isWeekend || t.isHoliday ? (
          <div
            key={`off-${t.day}`}
            title={t.holidayLabel}
            style={{
              position: 'absolute', top: 0, left: t.left, width: dayPx, height,
              background: t.isHoliday ? 'var(--blocked-bg, var(--bg-subtle))' : 'var(--bg-subtle)',
              pointerEvents: t.isHoliday ? 'auto' : 'none',
            }}
          />
        ) : null,
      )}
      {ticks.map((t) =>
        t.isWeekStart ? (
          <div
            key={`wk-${t.day}`}
            style={{
              position: 'absolute', top: 0, bottom: 0, left: t.left, width: 1,
              background: 'var(--border-muted)', pointerEvents: 'none',
            }}
          />
        ) : null,
      )}
      {/* Milestone vertical guides — dashed so they read distinctly from the
          solid `--accent` today marker. Sit above week dividers but below the
          bars (which carry their own z-index). */}
      {milestoneMarks?.map((mk) => (
        <div
          key={`ms-${mk.id}`}
          style={{
            position: 'absolute', top: 0, bottom: 0,
            left: mk.centre - 0.5, width: 0,
            borderLeft: `1px dashed ${mk.color}`,
            pointerEvents: 'none', zIndex: 1,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute', top: 0, bottom: 0, left: todayOffset - 0.5,
          width: 1, background: 'var(--accent)', pointerEvents: 'none', zIndex: 1,
        }}
      />
    </>
  );
}

// Header flag chip for a single milestone. Anchored to the centre of the
// milestone's day; truncated so a long name doesn't overlap a neighbouring
// chip too aggressively. Pure presentation — the matching dashed vertical
// line is rendered by `PlannerBackdrop`.
const PLANNER_MILESTONE_CHIP_WIDTH = 132;

function PlannerMilestoneFlag({ mark, todayIso }: { mark: PlannerMilestoneMark; todayIso: string }) {
  const tip = (() => {
    const abs = formatPlannerMilestoneDate(mark.date);
    const rel = mark.isOverdue
      ? `${calendarDaysBetween(mark.date, todayIso)} days overdue`
      : mark.date === todayIso
        ? 'due today'
        : `due ${abs}`;
    const head = `${mark.name} · ${rel}`;
    return mark.description ? `${head}\n${mark.description}` : head;
  })();
  return (
    <div
      data-tip={tip}
      style={{
        position: 'absolute',
        left: mark.centre - PLANNER_MILESTONE_CHIP_WIDTH / 2,
        top: 4,
        width: PLANNER_MILESTONE_CHIP_WIDTH,
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '1px 6px',
        borderRadius: 10,
        background: mark.isOverdue ? 'var(--blocked-bg)' : 'var(--accent-muted)',
        color: mark.color,
        fontSize: 10.5, fontWeight: 600,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        zIndex: 2,
        pointerEvents: 'auto',
      }}
    >
      <Icon name="flag" size={10} color={mark.color} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{mark.name}</span>
    </div>
  );
}

function formatPlannerMilestoneDate(iso: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = iso.split('-').map(Number);
  return `${months[m - 1]} ${d}, ${y}`;
}

function calendarDaysBetween(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split('-').map(Number);
  const [by, bm, bd] = bIso.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// PlannerBarEditPopover — bar-click popover with assignee picker. Slice 7
// adds a team picker on top; keeping it local so that addition doesn't
// have to thread through `BarEditPopover` in `issues-gantt.tsx`.
// ---------------------------------------------------------------------------

function PlannerBarEditPopover({
  issue, tenant, workspace, left,
  hasAssigneeOverride, teamId, teams, placedAssigneeUserId,
  onAssigneeChange, onClearAssigneeOverride,
  onSetTeam, onClearTeam,
  onClose,
}: {
  issue: Issue;
  tenant: string;
  workspace: string;
  left: number;
  /** True iff `key in plan.assigneeOverrides`. Drives header chip + the
   *  "Clear assignee" / "Revert to default" affordances. */
  hasAssigneeOverride: boolean;
  /** UUID of the team attached to this issue (BE-persisted via
   *  `Issue.teamId`). Drives header chip + the Team section state. */
  teamId: string | undefined;
  /** Active workspace teams. Source for the team picker; PlannerGantt
   *  owns the single `useTeams()` subscription. */
  teams: Team[];
  /** Resolved assignee from the scheduler — drives the team-greedy hint. */
  placedAssigneeUserId: string | null;
  /** Set the override (or clear with `null` for "explicitly no assignee"). */
  onAssigneeChange: (userId: string | null) => void;
  /** Drop the override entry — falls back to BE-canonical assignee. */
  onClearAssigneeOverride: () => void;
  /** Team-on-Issue slice 4 (2026-05-07) — attach a team via the BE.
   *  PlannerGantt routes this through `useIssues().patchIssue({ teamId,
   *  assigneeUserId: null })` so the optimistic state matches the BE's
   *  auto-clear of the assignee. **This is the documented exception to
   *  the planner's FE-only stance** — team picks are organisational
   *  decisions that should stick across plan scenarios. The assignee
   *  picker still writes to plan state. */
  onSetTeam: (teamId: string) => void;
  /** Detach the team via `patchIssue({ teamId: null })`. */
  onClearTeam: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, true);
  const [search, setSearch] = useState('');
  const { searchUsers, getUser } = useUsers();
  const { getProjectById } = useProjects();
  const projectSlug = getProjectById(issue.projectId)?.slug ?? '';

  const filtered = useMemo(() => searchUsers(search), [searchUsers, search]);

  // Bugs hide the Team section per spec — team-attach is Task-only.
  const showTeamSection = issue.type === 'T';
  const attachedTeam = teamId ? teams.find((t) => t.id === teamId) ?? null : null;
  const greedyHint = !!attachedTeam && placedAssigneeUserId == null;
  // Resolve the placed assignee for the "Currently" strip below the
  // Assignee header. UUID never renders — fall back to "Unknown user"
  // if the user isn't in cache.
  const placedUser = placedAssigneeUserId ? getUser(placedAssigneeUserId) : null;

  // Small inline section-header style — reused for both Assignee + Team.
  const sectionHeaderStyle: CSSProperties = {
    padding: '8px 12px 4px',
    fontSize: 10.5, fontWeight: 600, color: 'var(--fg-muted)',
    textTransform: 'uppercase', letterSpacing: 0.5,
  };
  const planChipStyle: CSSProperties = {
    display: 'inline-flex', alignItems: 'center',
    padding: '1px 6px', borderRadius: 8,
    background: 'var(--accent-subtle)', color: 'var(--accent-active)',
    fontSize: 10, fontWeight: 600, flexShrink: 0,
  };

  return (
    <div
      ref={ref}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: ROW_HEIGHT - 2,
        left: Math.max(0, left),
        zIndex: 30,
        width: 300,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}
    >
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--border-muted)',
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      }}>
        <TypeChip type={issue.type} />
        <Link
          to={`/${tenant}/${workspace}/${projectSlug}/issue/${issue.key}`}
          onClick={onClose}
          style={{ textDecoration: 'none', color: 'inherit' }}
          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
        >
          <IssueId id={issue.key} />
        </Link>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 12, color: 'var(--fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {issue.title}
        </span>
        {hasAssigneeOverride && <span style={planChipStyle}>Plan override</span>}
        {teamId && <span style={planChipStyle}>Team</span>}
      </div>

      {/* Assignee section — shown for both Tasks and Bugs */}
      <div style={sectionHeaderStyle}>Assignee (plan only)</div>
      {/* Currently-assigned strip. Surfaces who the scheduler placed on
          this bar so the user doesn't have to scroll the picker list to
          find the check-marked row.
          Auto-picked treatment (2026-05-07): when the placed assignee
          came from team-greedy (not the explicit issue assignee), the
          name is italicised and we append an "Auto-picked" chip + a
          footnote explaining how to make it explicit. Explicit
          assignees keep the plain treatment so the dynamic-vs-fixed
          distinction is unmissable at a glance. */}
      {(() => {
        const isAutoPicked = placedUser !== null
          && placedAssigneeUserId !== null
          && placedAssigneeUserId !== issue.assigneeUserId
          && attachedTeam !== null;
        return (
          <div style={{
            padding: '2px 12px 8px',
            display: 'flex', flexDirection: 'column', gap: 4,
            fontSize: 12, color: 'var(--fg-muted)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>Currently</span>
              {placedUser ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Avatar name={placedUser.displayName} size={18} />
                  <span style={{
                    color: 'var(--fg)',
                    fontStyle: isAutoPicked ? 'italic' : 'normal',
                  }}>
                    {placedUser.displayName}
                  </span>
                  {isAutoPicked && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '1px 6px', borderRadius: 8,
                      background: 'var(--accent-subtle)', color: 'var(--accent-active)',
                      fontSize: 10, fontWeight: 600, flexShrink: 0,
                    }}>
                      Auto-picked
                    </span>
                  )}
                </span>
              ) : attachedTeam ? (
                <span style={{ fontStyle: 'italic' }}>
                  Unassigned — earliest free member of {attachedTeam.name} will pick this up.
                </span>
              ) : (
                <span style={{ fontStyle: 'italic' }}>Unassigned</span>
              )}
            </div>
            {isAutoPicked && attachedTeam && (
              <div style={{
                fontSize: 11, color: 'var(--fg-faint)', fontStyle: 'italic',
                lineHeight: 1.5,
              }}>
                Picked from {attachedTeam.name} based on availability. Change by attaching a different team or naming a person.
              </div>
            )}
          </div>
        );
      })()}
      <div style={{ padding: '0 10px 8px' }}>
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 8, top: '50%',
            transform: 'translateY(-50%)', color: 'var(--fg-faint)',
          }}>
            <Icon name="search" size={12} />
          </span>
          <input
            autoFocus
            className="input input-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members…"
            style={{ paddingLeft: 26 }}
          />
        </div>
      </div>
      <div className="scroll" style={{ maxHeight: 200, overflow: 'auto', padding: 4 }}>
        {filtered.map((u) => {
          const isCurrent = u.id === placedAssigneeUserId;
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => { onAssigneeChange(u.id); onClose(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '6px 8px', borderRadius: 5, fontSize: 13,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--fg)', textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Avatar name={u.displayName} size={20} />
              <span style={{
                flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {u.displayName}
              </span>
              {isCurrent && <Icon name="check" size={12} color="var(--accent)" />}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 12 }}>
            No matches.
          </div>
        )}
      </div>
      {hasAssigneeOverride && (
        <div style={{
          padding: '6px 10px 8px', display: 'flex', gap: 6,
          borderTop: '1px solid var(--border-muted)',
        }}>
          {/* "Clear assignee" — explicitly null override; falls through to
              team-greedy if a team is attached, else flags as unscheduled. */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { onAssigneeChange(null); onClose(); }}
            style={{ flex: 1 }}
            title="Mark as having no assignee in this plan. Falls back to team-greedy if a team is attached."
          >
            Clear assignee
          </button>
          {/* "Revert to default" — drops the override entry, restoring the
              BE-canonical assignee. */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { onClearAssigneeOverride(); onClose(); }}
            style={{ flex: 1 }}
            title="Drop the plan override and use the issue's saved assignee."
          >
            Revert to default
          </button>
        </div>
      )}

      {/* Team section — Tasks only. Team-on-Issue slice 4 (2026-05-07):
          unlike the assignee picker above, picks here PERSIST to the BE
          via `useIssues().patchIssue({ teamId, assigneeUserId: null })`.
          Documented exception to the planner's FE-only stance. */}
      {showTeamSection && (
        <>
          <div style={{
            ...sectionHeaderStyle,
            borderTop: '1px solid var(--border-muted)',
            paddingTop: 10,
          }}>
            Team
          </div>
          <div style={{ padding: '0 10px 4px' }}>
            {attachedTeam ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 5,
                background: 'var(--bg-subtle)', fontSize: 13,
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 2,
                  background: attachedTeam.color, flexShrink: 0,
                }} />
                <span style={{
                  flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: 'var(--fg)',
                }}>
                  {attachedTeam.name}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => { onClearTeam(); }}
                  title="Detach team — the leaf falls back to its assignee."
                >
                  Detach
                </button>
              </div>
            ) : (
              <div style={{ padding: '4px 8px', fontSize: 12, color: 'var(--fg-faint)' }}>
                No team attached.
              </div>
            )}
          </div>
          <div className="scroll" style={{ maxHeight: 160, overflow: 'auto', padding: 4 }}>
            {teams.map((t) => {
              const isCurrent = t.id === teamId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { onSetTeam(t.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '6px 8px', borderRadius: 5, fontSize: 13,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--fg)', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: t.color, flexShrink: 0,
                  }} />
                  <span style={{
                    flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.name}
                  </span>
                  <span className="tnum" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
                    {t.members.length}
                  </span>
                  {isCurrent && <Icon name="check" size={12} color="var(--accent)" />}
                </button>
              );
            })}
            {teams.length === 0 && (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 12 }}>
                No teams in this workspace.
              </div>
            )}
          </div>
          {greedyHint && attachedTeam && (
            <div style={{
              padding: '6px 12px 10px', fontSize: 11,
              color: 'var(--fg-faint)', fontStyle: 'italic',
            }}>
              Earliest free member of "{attachedTeam.name}" will pick this up.
            </div>
          )}
        </>
      )}
    </div>
  );
}

