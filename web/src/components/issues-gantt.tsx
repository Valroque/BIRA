// Gantt timeline view shared by My Issues + All Issues. Consumes the same
// `Group[]` shape as IssuesTable so filtering, sorting, grouping, and
// collapse state stay shared. Bars are positioned by `startDate`/`endDate`
// (ISO YYYY-MM-DD) — issues missing both render as a "No schedule"
// placeholder in the label column.
import { Fragment, useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './icons';
import { TypeChip, IssueId, Avatar } from './shell';
import { useDismiss } from './use-dismiss';
import { IDEAL_POINTS_PER_DAY, computeTaskLoad, type Issue, type Milestone } from '../fixtures';
import { useIssues } from '../state/issues';
import { useProjects } from '../state/projects';
import { useUsers } from '../state/users';
import type { IssueGroupKey } from './issues-table';
// Pure helpers (day/week math, range building, bar derivation, per-day load,
// status colour resolution, formatting) live in gantt-utils.ts so the
// planner gantt can reuse them without pulling in this file's React layer.
import {
  buildDayTicks,
  buildMonthSpans,
  barFor,
  dailyLoadFor,
  dayToIso,
  deriveRange,
  fromDayNumber,
  formatOverload,
  formatPpd,
  issueBar,
  statusColors,
  toDayNumber,
  todayDay,
  type BarSpec,
  type DayRange,
  type DayTick,
} from './gantt-utils';

interface Group {
  id: string;
  label: string;
  swatch?: ReactNode;
  items: Issue[];
}

export type GanttGranularity = 'auto' | 'day' | 'week';

/**
 * Slice 6 — distinguishes the two gantts. Planning is ephemeral (writes
 * only to the localStorage overrides layer); reality persists every drag
 * commit through the BE PATCH endpoint. Default for unwitting callers is
 * `'planning'` so workspace-level My Issues / All Issues behave exactly
 * as before.
 *
 * In reality mode, drags STILL write through the override layer for
 * smooth visual feedback during the gesture; on mouseup the override is
 * cleared and the final value is sent to the BE so the persisted state
 * lives entirely in the workspace cache.
 */
export type GanttMode = 'reality' | 'planning';

interface IssuesGanttProps {
  groups: Group[];
  groupBy: IssueGroupKey;
  collapsed: Set<string>;
  onToggleCollapsed: (id: string) => void;
  tenant: string;
  workspace: string;
  /**
   * When true, nest children under their parents within each group (Epic →
   * Story → Task/Bug). When false, render rows flat.
   */
  hierarchical: boolean;
  /**
   * Time-axis density. 'auto' (default) zooms out automatically for long
   * spans; 'day' and 'week' force the tick mode regardless of span.
   */
  granularity: GanttGranularity;
  /** Reality vs planning. See `GanttMode`. Defaults to 'planning'. */
  mode?: GanttMode;
  /**
   * Project-level milestones to surface as vertical lines + flag chips in
   * the timeline header. Only the project gantt passes this — workspace-
   * level views (My Issues / All Issues) intentionally omit it. Milestones
   * outside the visible day-range are silently dropped.
   */
  milestones?: Milestone[];
}

/**
 * Pre-computed milestone position used by both the header flag chips and
 * the per-row vertical dashed lines. Milestones outside the visible range
 * are filtered out before this is built.
 */
interface MilestoneMark {
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

// Tree row produced by `flattenTree` — depth drives the indent, hasChildren
// drives the chevron.
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

const ROW_HEIGHT = 32;
const LABEL_COL_WIDTH = 360;
const HEADER_HEIGHT = 56;
const GROUP_HEADER_HEIGHT = 32;

function groupSpan(items: Issue[]): BarSpec | null {
  let min = Infinity;
  let max = -Infinity;
  for (const i of items) {
    const b = issueBar(i);
    if (!b) continue;
    if (b.startDay < min) min = b.startDay;
    if (b.endDay > max) max = b.endDay;
  }
  if (!isFinite(min)) return null;
  return { startDay: min, endDay: max, hasStart: true, hasEnd: true };
}

// ---------------------------------------------------------------------------

export function IssuesGantt({
  groups, groupBy, collapsed, onToggleCollapsed, tenant, workspace, hierarchical, granularity,
  mode = 'planning',
  milestones,
}: IssuesGanttProps) {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(() => new Set());
  const toggleNode = (id: string) => setCollapsedNodes((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Edits flow through the IssuesProvider. In planning mode they persist
  // to the localStorage overrides layer so a refresh keeps the user's
  // what-if drags. In reality mode the override is used purely for live
  // visual feedback during the drag — on commit (mouseup) the final
  // value is PATCHed to the BE and the override is cleared so the cache
  // is the single source of truth.
  const { updateIssue, patchIssue, resetIssue } = useIssues();
  // During-drag preview — same code path for both modes; in reality mode
  // we'll clear the override on commit/error.
  const updateDates = useCallback(
    (key: string, next: { startDate?: string; endDate?: string }) => updateIssue(key, next),
    [updateIssue],
  );
  // Bar-drag commit. In planning mode the override IS the persisted
  // state; we do nothing extra. In reality mode we PATCH and clear.
  // Errors don't surface visually here yet — the bar simply snaps back
  // to the BE-canonical position via the override clear; a toast layer
  // (later slice) is the right home for non-blocking failure feedback.
  const commitDates = useCallback(
    async (key: string, next: { startDate: string; endDate: string }) => {
      if (mode !== 'reality') return;
      const result = await patchIssue(key, { startDate: next.startDate, endDate: next.endDate });
      // Either way, drop the override — on success the cache holds the
      // server value; on error the cache is rolled back inside patchIssue.
      resetIssue(key);
      if (!result.ok) {
        // Surface to the console for now — gantt-level non-blocking
        // failures will plug into the toast system in a later slice.
        console.warn(`[gantt] failed to persist dates for ${key}: ${result.message}`);
      }
    },
    [mode, patchIssue, resetIssue],
  );
  // Assignee-change commit (the bar's edit popover changes assignee). Same
  // shape as commitDates: PATCH + override clear on reality, no-op planning.
  const updateAssignee = useCallback(
    async (key: string, userId: string | null) => {
      // Optimistic local — keeps planning behaviour intact AND gives
      // reality-mode users the same instant feedback.
      updateIssue(key, { assigneeUserId: userId });
      if (mode !== 'reality') return;
      const result = await patchIssue(key, { assigneeUserId: userId });
      resetIssue(key);
      if (!result.ok) {
        console.warn(`[gantt] failed to reassign ${key}: ${result.message}`);
      }
    },
    [mode, updateIssue, patchIssue, resetIssue],
  );
  // Which row's edit popover is open, if any. Anchored to the bar; opened by
  // a no-drag click on the bar, dismissed by outside-click or Escape.
  const [editingId, setEditingId] = useState<string | null>(null);
  const effectiveGroups = groups;
  const allItems = useMemo(() => effectiveGroups.flatMap((g) => g.items), [effectiveGroups]);
  const lookup = useMemo(() => {
    const m = new Map<string, Issue>();
    for (const i of allItems) m.set(i.key, i);
    return m;
  }, [allItems]);

  const today = todayDay();
  const range = useMemo(() => deriveRange(allItems, today), [allItems, today]);
  const totalDays = range.end - range.start + 1;

  // Granularity:
  //   'day'  → always per-day ticks (32 / 22 px/day depending on span).
  //   'week' → one tick per week (12 px/day so a week column is ~84 px).
  //   'auto' → preserve historical behaviour: weekly past 90 days, otherwise
  //            adaptive day width.
  const weekly = granularity === 'week' || (granularity === 'auto' && totalDays > 90);
  const dayPx = weekly
    ? 12
    : granularity === 'day'
      ? totalDays > 45 ? 22 : 32
      : totalDays > 45 ? 22 : 32;
  const timelineWidth = totalDays * dayPx;

  const months = useMemo(() => buildMonthSpans(range, dayPx), [range, dayPx]);
  const ticks = useMemo(() => buildDayTicks(range, dayPx, today, weekly), [range, dayPx, today, weekly]);
  const todayOffset = (today - range.start) * dayPx + dayPx / 2;

  // Resolve milestones to pixel positions once per relevant change. Skipping
  // milestones outside the visible day-range keeps the header chips honest:
  // a deadline two years off shouldn't squat at the right edge.
  const todayIso = useMemo(() => dayToIso(today), [today]);
  const milestoneMarks = useMemo<MilestoneMark[]>(() => {
    if (!milestones || milestones.length === 0) return [];
    const out: MilestoneMark[] = [];
    for (const m of milestones) {
      const day = toDayNumber(m.date);
      if (day < range.start || day > range.end) continue;
      const isOverdue = m.date < todayIso;
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
  }, [milestones, range.start, range.end, dayPx, todayIso]);

  const isFlat = groupBy === 'none';

  return (
    <div style={{ display: 'inline-block', minWidth: '100%' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${LABEL_COL_WIDTH}px ${timelineWidth}px`,
        }}
      >
        {/* Header — issue label column */}
        <div
          style={{
            position: 'sticky', top: 0, left: 0, zIndex: 4,
            background: 'var(--bg)',
            borderRight: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            height: HEADER_HEIGHT,
            display: 'flex', alignItems: 'flex-end',
            padding: '0 16px 8px',
            fontSize: 10.5, fontWeight: 600, color: 'var(--fg-muted)',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}
        >
          Issue
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
          {/* Month strip */}
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
          {/* Day/week strip */}
          <div
            style={{
              position: 'relative',
              height: HEADER_HEIGHT - 26,
              width: timelineWidth,
              borderTop: '1px solid var(--border-muted)',
            }}
          >
            {/* Milestone flag chips. Sit above the ticks (zIndex 2) so they
                read first; truncated to ~140px so a long name doesn't push
                neighbouring marks off-axis. */}
            {milestoneMarks.map((mk) => (
              <MilestoneFlag key={`flag-${mk.id}`} mark={mk} todayIso={todayIso} />
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

        {/* Body rows */}
        {effectiveGroups.map((g) => {
          const isCollapsed = collapsed.has(g.id);
          return (
            <Fragment key={g.id}>
              {!isFlat && (
                <GroupRow
                  group={g}
                  isCollapsed={isCollapsed}
                  onToggle={() => onToggleCollapsed(g.id)}
                  range={range}
                  dayPx={dayPx}
                  timelineWidth={timelineWidth}
                  weekly={weekly}
                  ticks={ticks}
                  todayOffset={todayOffset}
                  milestoneMarks={milestoneMarks}
                  showAssigneeLoad={groupBy === 'assignee'}
                />
              )}
              {(isFlat || !isCollapsed) && (
                hierarchical
                  ? buildAndFlattenTree(g.items, collapsedNodes)
                      .filter((row) => !row.parentChainCollapsed)
                      .map((row) => (
                        <IssueRow
                          key={row.issue.key}
                          issue={row.issue}
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
                          onDateChange={updateDates}
                          onDateCommit={commitDates}
                          onAssigneeChange={updateAssignee}
                          editingOpen={editingId === row.issue.key}
                          onOpenEdit={() => setEditingId(row.issue.key)}
                          onCloseEdit={() => setEditingId(null)}
                          lookup={lookup}
                        />
                      ))
                  : g.items.map((issue) => (
                      <IssueRow
                        key={issue.key}
                        issue={issue}
                        tenant={tenant}
                        workspace={workspace}
                        range={range}
                        dayPx={dayPx}
                        timelineWidth={timelineWidth}
                        weekly={weekly}
                        ticks={ticks}
                        todayOffset={todayOffset}
                        milestoneMarks={milestoneMarks}
                        onDateChange={updateDates}
                        onDateCommit={commitDates}
                        onAssigneeChange={updateAssignee}
                        editingOpen={editingId === issue.key}
                        onOpenEdit={() => setEditingId(issue.key)}
                        onCloseEdit={() => setEditingId(null)}
                        lookup={lookup}
                      />
                    ))
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface RowChromeProps {
  range: DayRange;
  dayPx: number;
  timelineWidth: number;
  weekly: boolean;
  ticks: DayTick[];
  todayOffset: number;
  /**
   * Milestone marks visible on this gantt. Empty when the consumer didn't
   * pass any (workspace-level views) or when the project has no milestones
   * within the visible range.
   */
  milestoneMarks: MilestoneMark[];
}

interface GroupRowProps extends RowChromeProps {
  group: Group;
  isCollapsed: boolean;
  onToggle: () => void;
  /**
   * When true, render a per-day load overlay on this group's timeline
   * row — red cells where the group's items together exceed the ideal
   * pts/day. Only meaningful when the Gantt is grouped by assignee.
   */
  showAssigneeLoad: boolean;
}
function GroupRow({
  group, isCollapsed, onToggle,
  range, dayPx, timelineWidth, weekly, ticks, todayOffset, milestoneMarks,
  showAssigneeLoad,
}: GroupRowProps) {
  const span = useMemo(() => groupSpan(group.items), [group.items]);
  // Only build the per-day load when we're going to render it.
  const dailyLoad = useMemo(
    () => (showAssigneeLoad ? dailyLoadFor(group.items) : null),
    [showAssigneeLoad, group.items],
  );
  const overloadDays = useMemo(() => {
    if (!dailyLoad) return [] as { day: number; points: number; overload: number }[];
    const rows: { day: number; points: number; overload: number }[] = [];
    for (const [day, pts] of dailyLoad) {
      const overload = pts / IDEAL_POINTS_PER_DAY;
      if (overload > 1.0001 && day >= range.start && day <= range.end) {
        rows.push({ day, points: pts, overload });
      }
    }
    return rows;
  }, [dailyLoad, range.start, range.end]);

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        style={{
          position: 'sticky', left: 0, zIndex: 2,
          display: 'flex', alignItems: 'center', gap: 8,
          height: GROUP_HEADER_HEIGHT,
          padding: '0 16px',
          background: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border-muted)',
          borderRight: '1px solid var(--border)',
          border: 'none', borderLeft: 'none',
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
        {group.swatch}
        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {group.label}
        </span>
        <span className="tnum" style={{ color: 'var(--fg-faint)' }}>{group.items.length}</span>
        {showAssigneeLoad && overloadDays.length > 0 && (
          <span
            data-tip={`Overworked on ${overloadDays.length} day${overloadDays.length === 1 ? '' : 's'}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '1px 6px', borderRadius: 8,
              background: 'var(--blocked-bg)', color: 'var(--blocked)',
              fontSize: 10, fontWeight: 600,
            }}
          >
            <Icon name="alert" size={10} />
            <span className="tnum">{overloadDays.length}</span>
          </span>
        )}
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
        <TimelineBackdrop
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
            }}
          />
        )}
        {/* Red day-cells over weekdays where this assignee's combined
            scheduled load exceeds the ideal capacity. Sits above the
            backdrop and the gray span bar so it reads at a glance. */}
        {showAssigneeLoad && overloadDays.map(({ day, points, overload }) => {
          const isoDate = (() => {
            const dt = fromDayNumber(day);
            return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
          })();
          return (
            <div
              key={`load-${day}`}
              title={`${group.label}: ${points.toFixed(1)} pts on ${isoDate} (${overload.toFixed(1)}× ideal)`}
              style={{
                position: 'absolute', top: 0, bottom: 0,
                left: (day - range.start) * dayPx, width: dayPx,
                background: 'rgba(239, 68, 68, 0.22)',
                borderTop: '2px solid var(--blocked)',
                pointerEvents: 'auto',
              }}
            />
          );
        })}
      </div>
    </>
  );
}

interface IssueRowProps extends RowChromeProps {
  issue: Issue;
  tenant: string;
  workspace: string;
  /** Indent depth in the parent/child tree (0 = root). */
  depth?: number;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  /** Live during-drag preview — fires every mousemove. */
  onDateChange: (key: string, next: { startDate?: string; endDate?: string }) => void;
  /**
   * End-of-drag commit — fires once on mouseup with the final dates.
   * Reality mode uses this to PATCH the BE; planning mode is a no-op
   * since the live override already represents the persisted state.
   */
  onDateCommit: (key: string, next: { startDate: string; endDate: string }) => void | Promise<void>;
  onAssigneeChange: (key: string, userId: string | null) => void | Promise<void>;
  editingOpen: boolean;
  onOpenEdit: () => void;
  onCloseEdit: () => void;
  lookup: Map<string, Issue>;
}
function IssueRow({
  issue, tenant, workspace,
  range, dayPx, timelineWidth, weekly, ticks, todayOffset, milestoneMarks,
  depth = 0, hasChildren = false, isExpanded = true, onToggleExpand,
  onDateChange, onDateCommit, onAssigneeChange, editingOpen, onOpenEdit, onCloseEdit, lookup,
}: IssueRowProps) {
  // Tasks/Bugs carry their own dates and the bar is editable.
  // Stories/Epics derive a read-only bar from descendant leaves.
  const editable = issue.type === 'T' || issue.type === 'B';
  const bar = barFor(issue, lookup);
  const colors = statusColors(issue.status);
  // Workload check: only meaningful for Tasks (the unit of scheduled
  // effort). When the assignee would have to deliver more than
  // IDEAL_POINTS_PER_DAY to hit the dates as drawn, the bar is striped
  // with the blocked colour and the tooltip calls it out explicitly.
  const load = issue.type === 'T'
    ? computeTaskLoad(issue.estimate, issue.startDate, issue.endDate)
    : null;
  const overloaded = !!(load && load.overload > 1.0001);
  // Resolve the project's slug for the link target. UUIDs never appear in
  // URLs (slug stays the user-facing handle).
  const { getProjectById } = useProjects();
  const projectSlug = getProjectById(issue.projectId)?.slug ?? '';
  const issueHref = `/${tenant}/${workspace}/${projectSlug}/issue/${issue.key}`;

  // 16px per depth, plus an extra 16px gutter so root rows still leave room
  // for the chevron column when something at the same level has children.
  const indent = depth * 16;

  const labelStyle: CSSProperties = {
    position: 'sticky', left: 0, zIndex: 1,
    display: 'flex', alignItems: 'center', gap: 8,
    height: ROW_HEIGHT,
    padding: `0 16px 0 ${16 + indent}px`,
    background: 'var(--bg)',
    borderBottom: '1px solid var(--border-muted)',
    borderRight: '1px solid var(--border)',
    width: LABEL_COL_WIDTH,
    minWidth: 0,
  };

  // Drag interactions on the bar:
  //   move          — translate both ends by the same delta
  //   resize-start  — drag left edge, clamped to ≤ end
  //   resize-end    — drag right edge, clamped to ≥ start
  // For partially-set bars (only start or only end), we materialise both
  // sides on first interaction so the resulting span is concrete.
  const startBarDrag = (mode: 'move' | 'resize-start' | 'resize-end', e: React.MouseEvent) => {
    if (!bar || !editable) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = bar.startDay;
    const origEnd = bar.endDay;
    // Track whether the gesture turned into a real drag — anything past the
    // 3px threshold counts. A clean mousedown→mouseup with no drag opens the
    // edit popover instead of mutating dates.
    let didDrag = false;
    // Latest committed-during-drag values; the mouseup handler reuses these
    // for the BE PATCH so we don't recompute deltas after the listener has
    // already detached.
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
      onDateChange(issue.key, { startDate: dayToIso(newStart), endDate: dayToIso(newEnd) });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Click on the bar body (not the resize handles) opens the edit popover.
      if (!didDrag && mode === 'move') {
        onOpenEdit();
        return;
      }
      // Real drag completed — commit final dates. Reality mode PATCHes
      // and clears the local override; planning mode is a no-op.
      if (didDrag) {
        onDateCommit(issue.key, {
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

  // Click-and-drag on an empty (no-schedule) row to create a span.
  // Anchor is the day under the mouse on mousedown; releasing without
  // moving creates a one-day span on that day.
  const startCreateDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (bar || !editable) return;
    e.preventDefault();
    const trackRect = e.currentTarget.getBoundingClientRect();
    const anchorDay = range.start + Math.floor((e.clientX - trackRect.left) / dayPx);
    let lastStart = anchorDay;
    let lastEnd = anchorDay;
    onDateChange(issue.key, { startDate: dayToIso(anchorDay), endDate: dayToIso(anchorDay) });
    const onMove = (ev: MouseEvent) => {
      const day = range.start + Math.floor((ev.clientX - trackRect.left) / dayPx);
      const s = Math.min(anchorDay, day);
      const ed = Math.max(anchorDay, day);
      lastStart = s;
      lastEnd = ed;
      onDateChange(issue.key, { startDate: dayToIso(s), endDate: dayToIso(ed) });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // Commit the final span on release. A click without movement still
      // commits a one-day span (lastStart === lastEnd === anchorDay).
      onDateCommit(issue.key, {
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

  return (
    <>
      <div style={{ ...labelStyle, padding: `0 16px 0 ${4 + indent}px` }}>
        {hasChildren ? (
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
        {/* Issue id is the clickable link to the detail page; the title is
            plain text so dragging across it doesn't interpret as a click. */}
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
        {/* "No schedule" only applies to leaves (Tasks/Bugs). Stories/Epics
            don't carry their own schedule — their bar derives from descendant
            leaves — so the absence of a bar there isn't a missing field, it's
            just an empty subtree. */}
        {!bar && editable && (
          <span style={{ fontSize: 10.5, color: 'var(--fg-faint)', flexShrink: 0 }}>No schedule</span>
        )}
      </div>
      <div
        onMouseDown={!bar && editable ? startCreateDrag : undefined}
        style={{
          position: 'relative',
          height: ROW_HEIGHT,
          width: timelineWidth,
          borderBottom: '1px solid var(--border-muted)',
          background: 'var(--bg)',
          cursor: !bar && editable ? 'crosshair' : undefined,
        }}
      >
        <TimelineBackdrop
          ticks={ticks}
          dayPx={dayPx}
          weekly={weekly}
          todayOffset={todayOffset}
          height={ROW_HEIGHT}
          milestoneMarks={milestoneMarks}
        />
        {bar && (
          <div
            title={(() => {
              if (!editable) return `${issue.key} · ${issue.title}\nRolled up from descendants`;
              const head = `${issue.key} · ${issue.title}\n${issue.startDate ?? '—'} → ${issue.endDate ?? '—'}`;
              const loadLine = load
                ? `\n${issue.estimate} pts over ${load.workingDays} working day${load.workingDays === 1 ? '' : 's'} → ${formatPpd(load.pointsPerDay)} pts/day${overloaded ? ` (${formatOverload(load.overload)} ideal load — overworked)` : ''}`
                : '';
              return `${head}${loadLine}\nDrag to move, drag edges to resize`;
            })()}
            onMouseDown={editable ? (e) => startBarDrag('move', e) : undefined}
            onClick={!editable ? (e) => { e.stopPropagation(); onOpenEdit(); } : undefined}
            style={{
              position: 'absolute',
              top: 6,
              height: ROW_HEIGHT - 12,
              left: (bar.startDay - range.start) * dayPx + 1,
              width: Math.max(dayPx - 2, (bar.endDay - bar.startDay + 1) * dayPx - 2),
              // Overloaded Tasks get a diagonal stripe overlay in the
              // blocked colour so the warning reads at a glance without
              // crowding the bar with extra chrome.
              background: editable
                ? overloaded
                  ? `repeating-linear-gradient(135deg, ${'var(--blocked-bg)'} 0 6px, ${colors.bg} 6px 12px)`
                  : colors.bg
                : 'var(--bg-muted)',
              border: `1px solid ${editable ? (overloaded ? 'var(--blocked)' : colors.fg) : 'var(--fg-faint)'}`,
              borderRadius: 4,
              display: 'flex', alignItems: 'center',
              padding: '0 6px',
              gap: 6,
              fontSize: 11,
              color: editable ? (overloaded ? 'var(--blocked)' : colors.fg) : 'var(--fg-muted)',
              fontWeight: 600,
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              opacity: editable ? (bar.hasStart && bar.hasEnd ? 1 : 0.85) : 0.7,
              borderStyle: editable && !(bar.hasStart && bar.hasEnd) ? 'dashed' : 'solid',
              cursor: editable ? 'grab' : 'pointer',
              userSelect: 'none',
            }}
          >
            {editable && (
              <div
                onMouseDown={(e) => startBarDrag('resize-start', e)}
                aria-label="Resize start"
                style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: 6,
                  cursor: 'col-resize',
                }}
              />
            )}
            {overloaded && (
              <Icon name="alert" size={11} color="var(--blocked)" />
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>{issue.title}</span>
            {editable && (
              <div
                onMouseDown={(e) => startBarDrag('resize-end', e)}
                aria-label="Resize end"
                style={{
                  position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                  cursor: 'col-resize',
                }}
              />
            )}
          </div>
        )}
        {editingOpen && bar && (
          <BarEditPopover
            issue={issue}
            tenant={tenant}
            workspace={workspace}
            left={(bar.startDay - range.start) * dayPx + 1}
            onAssigneeChange={(userId) => onAssigneeChange(issue.key, userId)}
            onClose={onCloseEdit}
          />
        )}
      </div>
    </>
  );
}

// Vertical week-start dividers, weekend / holiday shading, and the today
// marker — shared between group rows and issue rows so they line up.
function TimelineBackdrop({
  ticks, dayPx, weekly, todayOffset, height, milestoneMarks,
}: {
  ticks: DayTick[];
  dayPx: number;
  weekly: boolean;
  todayOffset: number;
  height: number;
  milestoneMarks: MilestoneMark[];
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
              // Holidays get a faint warm wash so they read as a non-routine
              // non-working day; plain weekends use the same neutral subtle
              // surface they always had.
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
          solid `--accent` today marker. Sit above week dividers but below
          the bars (which carry their own z-index in their parent row). */}
      {milestoneMarks.map((mk) => (
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
// line is rendered inside `TimelineBackdrop`.
const MILESTONE_CHIP_WIDTH = 132;

function MilestoneFlag({ mark, todayIso }: { mark: MilestoneMark; todayIso: string }) {
  const tip = (() => {
    const abs = formatMilestoneDate(mark.date);
    const rel = mark.isOverdue
      ? `${calendarDays(mark.date, todayIso)} days overdue`
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
        // Anchor centre of the chip on the milestone's day. Drop below the
        // top edge of the day strip so the chip doesn't collide with the
        // month strip border.
        left: mark.centre - MILESTONE_CHIP_WIDTH / 2,
        top: 4,
        width: MILESTONE_CHIP_WIDTH,
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

function formatMilestoneDate(iso: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = iso.split('-').map(Number);
  return `${months[m - 1]} ${d}, ${y}`;
}

function calendarDays(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split('-').map(Number);
  const [by, bm, bd] = bIso.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

// Bar-click edit popover. Anchored to the bar's start in the timeline track
// row. Currently lets the user reassign the issue; structured so adding more
// quick-edit fields later is straightforward.
function BarEditPopover({
  issue, tenant, workspace, left, onAssigneeChange, onClose,
}: {
  issue: Issue;
  tenant: string;
  workspace: string;
  /** Pixel offset of the bar's left edge within the track row. */
  left: number;
  /** Receives the picked user's UUID (or null to clear). */
  onAssigneeChange: (userId: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, true);
  const [search, setSearch] = useState('');
  const { searchUsers } = useUsers();
  const { getProjectById } = useProjects();
  const projectSlug = getProjectById(issue.projectId)?.slug ?? '';

  const filtered = useMemo(() => searchUsers(search), [searchUsers, search]);

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
        width: 260,
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
        display: 'flex', alignItems: 'center', gap: 6,
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
      </div>
      <div style={{
        padding: '8px 12px 4px',
        fontSize: 10.5, fontWeight: 600, color: 'var(--fg-muted)',
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        Assignee
      </div>
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
      <div className="scroll" style={{ maxHeight: 240, overflow: 'auto', padding: 4 }}>
        {filtered.map((u) => {
          const isCurrent = u.id === issue.assigneeUserId;
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
    </div>
  );
}
