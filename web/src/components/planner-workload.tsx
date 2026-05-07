// Planner — workload heatmap pivot.
//
// Slice 9 (2026-05-07). Sibling pivot to PlannerGantt: same scheduler
// output, different shape. Rows are members with at least one scheduled
// bar in the visible window; columns are every day in `plan.window`
// (working AND non-working). Cell colour reflects the member's per-day
// scheduled load in points; click a working-day cell to toggle that
// member's leave for that date.
//
// Why a separate component (not a tab inside PlannerGantt)? PlannerGantt
// is hierarchical (Epic > Story > Task) and bar-per-row; the workload
// view is a flat per-member matrix. Sharing one render path would need a
// pivot flag threading through every helper. Sibling components keep
// each surface narrow, and the gantt-utils helpers (day math, ticks,
// holiday names, schedule call) are already factored for reuse.
//
// Persistence: the only writes are `toggleMemberLeave` on cell click —
// `bira:planner:<tenant>:<workspace>` only. Never touches the BE,
// `bira:issue-overrides:v2`, or any other key.

import { Fragment, useMemo } from 'react';
import { Avatar } from './shell';
import { EmptyState } from './states';
import {
  isWorkingDate,
  IDEAL_POINTS_PER_DAY,
  type Issue,
} from '../fixtures';
import { useUsers } from '../state/users';
import { useTeams } from '../state/teams';
import { usePlanner } from '../state/planner';
import { scheduleIssues, type ScheduledBar } from './planner-scheduler';
import {
  buildDayTicks,
  buildMonthSpans,
  dayToIso,
  fromDayNumber,
  toDayNumber,
  formatPpd,
  formatOverload,
  type DayRange,
} from './gantt-utils';

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export interface PlannerWorkloadProps {
  /** Same `issues` array the gantt receives — already filtered by
   *  window in the parent. */
  issues: Issue[];
  /** Tenant + workspace from useTenantContext — held for parity with the
   *  gantt. Reserved for future link-out (e.g. clicking a row → member
   *  detail page). Not currently used inside the cell grid. */
  tenant: string;
  workspace: string;
  /** today as ISO YYYY-MM-DD. */
  today: string;
}

// ---------------------------------------------------------------------------
// Layout constants — match the gantt for visual continuity (sticky
// label column width, header height, row height).
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 32;
const LABEL_COL_WIDTH = 220;
const HEADER_HEIGHT = 56;
const DAY_PX = 22;

// ---------------------------------------------------------------------------
// Per-member daily load — distributed across each leaf's working-day span,
// using the *placed* assignee from the scheduler (NOT issue.assigneeUserId,
// which can differ when the scheduler routes a Task to a team member).
//
// Returns Map<userId, Map<dayNumber, points>>.
//
// Helper sits here rather than in `gantt-utils.ts` because it depends on
// scheduler output (`scheduled.get(issue.key)?.assigneeUserId`), which
// gantt-utils explicitly stays free of (`gantt-utils` is the pure
// calendar / shape layer; scheduler integration belongs alongside its
// only consumer).
// ---------------------------------------------------------------------------

function loadByMemberAndDay(
  issues: Issue[],
  scheduled: Map<string, ScheduledBar>,
): Map<string, Map<number, number>> {
  const out = new Map<string, Map<number, number>>();
  for (const issue of issues) {
    if (issue.type !== 'T' && issue.type !== 'B') continue;
    if (!issue.estimate || issue.estimate <= 0) continue;
    const bar = scheduled.get(issue.key);
    if (!bar) continue;
    if (!bar.assigneeUserId) continue;
    const startDay = toDayNumber(bar.startDate);
    const endDay = toDayNumber(bar.endDate);
    if (endDay < startDay) continue;
    // Distribute over the working days in the placed span. Mirrors
    // `dailyLoadFor` in gantt-utils but the input is the placed bar,
    // not the issue's own dates.
    const workingDays: number[] = [];
    for (let d = startDay; d <= endDay; d++) {
      if (isWorkingDate(fromDayNumber(d))) workingDays.push(d);
    }
    if (workingDays.length === 0) continue;
    const ppd = issue.estimate / workingDays.length;
    let memMap = out.get(bar.assigneeUserId);
    if (!memMap) {
      memMap = new Map<number, number>();
      out.set(bar.assigneeUserId, memMap);
    }
    for (const d of workingDays) {
      memMap.set(d, (memMap.get(d) ?? 0) + ppd);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-member daily provisional flag — Team-on-Issue slice 5 (2026-05-07).
//
// A cell is "provisional" when ANY contributing bar is team-greedy: the
// source Task has `assigneeUserId == null && teamId != null` and the
// scheduler picked someone from that team. Until a human is named the
// load reading on those days is contingent on the future pick — we
// stripe the cell to flag that.
//
// Rule: any contributing bar team-greedy → provisional. Multiple
// team-greedy bars on the same day collect their team names so the
// tooltip can list them; a single explicit-assignee bar on the same
// day does NOT clear the provisional flag (the day's points reading is
// still contingent on the team-greedy bar's eventual assignee — the
// safer read is "show provisional whenever any input is provisional").
//
// Returns Map<userId, Map<dayNumber, string[]>> — the value is the
// (deduped, ordered-by-first-encounter) list of contributing team
// names. Empty list means a contributing bar was team-greedy but the
// team name couldn't resolve; the cell still gets the stripe.
// ---------------------------------------------------------------------------

function provisionalByMemberAndDay(
  issues: Issue[],
  scheduled: Map<string, ScheduledBar>,
  teamNameById: Map<string, string>,
): Map<string, Map<number, string[]>> {
  const out = new Map<string, Map<number, string[]>>();
  for (const issue of issues) {
    if (issue.type !== 'T' && issue.type !== 'B') continue;
    if (!issue.estimate || issue.estimate <= 0) continue;
    // Only team-greedy contributors stripe the cell. Explicit assignee
    // bars contribute load but never the stripe.
    if (issue.assigneeUserId) continue;
    if (!issue.teamId) continue;
    const bar = scheduled.get(issue.key);
    if (!bar) continue;
    if (!bar.assigneeUserId) continue;
    const startDay = toDayNumber(bar.startDate);
    const endDay = toDayNumber(bar.endDate);
    if (endDay < startDay) continue;
    const workingDays: number[] = [];
    for (let d = startDay; d <= endDay; d++) {
      if (isWorkingDate(fromDayNumber(d))) workingDays.push(d);
    }
    if (workingDays.length === 0) continue;
    const teamName = teamNameById.get(issue.teamId);
    let memMap = out.get(bar.assigneeUserId);
    if (!memMap) {
      memMap = new Map<number, string[]>();
      out.set(bar.assigneeUserId, memMap);
    }
    for (const d of workingDays) {
      const existing = memMap.get(d);
      if (!existing) {
        memMap.set(d, teamName ? [teamName] : []);
      } else if (teamName && !existing.includes(teamName)) {
        existing.push(teamName);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bucket per-day points → token for the cell background. Math.round
// matches the legend (0 / 1 / 2 / 3 / 4 / 5 / 6 / 7+). Cap at 7+ red.
// ---------------------------------------------------------------------------

function tokenForLoad(points: number): string {
  if (points <= 0) return 'var(--workload-0)';
  const bucket = Math.min(7, Math.round(points));
  switch (bucket) {
    case 1: return 'var(--workload-1)';
    case 2: return 'var(--workload-2)';
    case 3: return 'var(--workload-3)';
    case 4: return 'var(--workload-4)';
    case 5: return 'var(--workload-5)';
    case 6: return 'var(--workload-6)';
    default: return 'var(--workload-7)';
  }
}

// ---------------------------------------------------------------------------
// Tooltip for an individual cell. Member · ISO · pts (when any) · overload
// ratio (when overloaded). Holiday cells append the holiday name.
// ---------------------------------------------------------------------------

function cellTitle(
  memberName: string,
  iso: string,
  points: number,
  isWeekend: boolean,
  isHoliday: boolean,
  holidayName: string | undefined,
  isLeave: boolean,
  provisionalTeams: string[] | null,
): string {
  if (isLeave) return `${memberName} · ${iso} · On leave`;
  if (isHoliday) return `${memberName} · ${iso} · ${holidayName ?? 'Holiday'}`;
  if (isWeekend) return `${memberName} · ${iso} · Weekend`;
  // Team-on-Issue slice 5 (2026-05-07): when ≥1 contributing bar is
  // team-greedy the cell is "provisional" — append a tail. Tight
  // formatting: list a single team by name, summarise as "provisional"
  // when ≥ 2 (avoids a long comma string in the title attribute).
  const provisionalTail = !provisionalTeams
    ? ''
    : provisionalTeams.length === 1
      ? ` · provisional · team: ${provisionalTeams[0]}`
      : ' · provisional';
  if (points <= 0) return `${memberName} · ${iso} · 0 pts${provisionalTail}`;
  const overload = points / IDEAL_POINTS_PER_DAY;
  const base = `${memberName} · ${iso} · ${formatPpd(points)} pts`;
  const withOverload = overload > 1 ? `${base} (${formatOverload(overload)} ideal)` : base;
  return `${withOverload}${provisionalTail}`;
}

// ---------------------------------------------------------------------------
// PlannerWorkload
// ---------------------------------------------------------------------------

export function PlannerWorkload({ issues, today }: PlannerWorkloadProps) {
  const { plan, toggleMemberLeave } = usePlanner();
  const { teams } = useTeams();
  const { getUser } = useUsers();

  // Same `teamMembersByUuid` derivation as the gantt — both views drive
  // the same scheduler input. If the gantt rebuilds this, so does this
  // pivot; the schedule call itself is memoised so it only re-runs on a
  // structural input change. Team-on-Issue slice 4 (2026-05-07): UUID-keyed
  // (was slug-keyed) so it lines up with `Issue.teamId`.
  const teamMembersByUuid = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const t of teams) {
      out[t.id] = t.members.map((m) => m.userId);
    }
    return out;
  }, [teams]);

  // Slice 9: project Record<userId, string[]> → Record<userId, Set<string>>
  // for O(1) probe inside the scheduler. Same shape rebuilt independently
  // by PlannerGantt — both views call usePlanner() and a Set is cheap to
  // construct, so deriving here avoids a pointless prop-drill.
  const memberLeavesByUserId = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    for (const [userId, days] of Object.entries(plan.memberLeaves)) {
      out[userId] = new Set(days);
    }
    return out;
  }, [plan.memberLeaves]);

  const schedule = useMemo(
    () => scheduleIssues({ issues, plan, today, teamMembersByUuid, memberLeavesByUserId }),
    [issues, plan, today, teamMembersByUuid, memberLeavesByUserId],
  );

  // Build per-member, per-day load using the *placed* assignee. A Task
  // without a placed bar (unscheduled / under a disabled issue or
  // ancestor) contributes nothing.
  const loadByMember = useMemo(
    () => loadByMemberAndDay(issues, schedule.scheduled),
    [issues, schedule],
  );

  // Team-on-Issue slice 5 (2026-05-07): UUID-keyed team-name lookup,
  // built once per `teams` change. Used by the provisional pass below
  // to label the cell tooltip — UUIDs never render here either.
  const teamNameById = useMemo(() => {
    const out = new Map<string, string>();
    for (const t of teams) out.set(t.id, t.name);
    return out;
  }, [teams]);

  // Per-cell provisional flag (Map<userId, Map<dayNumber, string[]>>).
  // Any contributing bar being team-greedy → cell stripes; the value
  // collects the contributing team names for the tooltip.
  const provisionalByMember = useMemo(
    () => provisionalByMemberAndDay(issues, schedule.scheduled, teamNameById),
    [issues, schedule, teamNameById],
  );

  // ---- Time range ------------------------------------------------------
  //
  // The heatmap matrix is exactly the visible window — no buffer, no
  // data-derived expansion. Unlike the gantt (which clamps
  // `deriveRange(...)` to the window) this view is a strict
  // member×day grid; rendering days outside the user's window would be
  // misleading because the corresponding bars would also be hidden.
  const today_n = useMemo(() => toDayNumber(today), [today]);
  const range: DayRange = useMemo(() => ({
    start: toDayNumber(plan.window.start),
    end: toDayNumber(plan.window.end),
  }), [plan.window.start, plan.window.end]);

  const totalDays = Math.max(1, range.end - range.start + 1);
  const empty = range.end < range.start;
  const timelineWidth = totalDays * DAY_PX;

  const months = useMemo(() => buildMonthSpans(range, DAY_PX), [range]);
  // Daily ticks (weekly=false) — one cell per day, matching the matrix.
  const ticks = useMemo(
    () => buildDayTicks(range, DAY_PX, today_n, false),
    [range, today_n],
  );

  // ---- Member rows -----------------------------------------------------
  //
  // Rows = members with at least one scheduled bar in the window. Empty
  // members are not rendered (per the spec). Sort by displayName for a
  // stable order; UUIDs as the deterministic tiebreaker.
  const memberRows = useMemo(() => {
    type Row = { userId: string; displayName: string };
    const rows: Row[] = [];
    for (const userId of loadByMember.keys()) {
      const u = getUser(userId);
      // Missing user shouldn't happen (scheduler placed the bar on them),
      // but defensively render with a fallback name rather than crashing.
      rows.push({
        userId,
        displayName: u?.displayName ?? 'Unknown user',
      });
    }
    rows.sort((a, b) => {
      const c = a.displayName.localeCompare(b.displayName);
      return c !== 0 ? c : a.userId.localeCompare(b.userId);
    });
    return rows;
  }, [loadByMember, getUser]);

  // ---- Empty states ----------------------------------------------------
  if (empty) {
    return (
      <div style={{
        height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '40px 32px',
      }}>
        <EmptyState
          icon="calendar"
          title="Window is empty"
          description="The end date is before the start date. Adjust the window above."
        />
      </div>
    );
  }
  if (memberRows.length === 0) {
    return (
      <div style={{
        height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '40px 32px',
      }}>
        <EmptyState
          icon="users"
          title="No scheduled work in this window"
          description="No member has a scheduled task in the visible time range."
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div style={{ display: 'inline-block', minWidth: '100%' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `${LABEL_COL_WIDTH}px ${timelineWidth}px`,
            }}
          >
            {/* Header — member label column */}
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
              Member
            </div>

            {/* Header — month + day strip. Mirrors planner-gantt header. */}
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
                {ticks.map((t) => (
                  <div
                    key={t.day}
                    title={t.holidayLabel}
                    style={{
                      position: 'absolute',
                      left: t.left,
                      width: DAY_PX,
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
                    }}
                  >
                    <span>{t.primaryLabel}</span>
                    <span style={{ fontSize: 9 }}>{t.secondaryLabel}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rows */}
            {memberRows.map((row) => {
              const memMap = loadByMember.get(row.userId) ?? new Map<number, number>();
              const leaveSet = memberLeavesByUserId[row.userId] ?? new Set<string>();
              // Slice 5: per-day provisional team list for this member.
              // Empty / unset → cell stays clean.
              const provMap = provisionalByMember.get(row.userId)
                ?? new Map<number, string[]>();
              return (
                <Fragment key={row.userId}>
                  {/* Sticky label cell */}
                  <div
                    style={{
                      position: 'sticky', left: 0, zIndex: 2,
                      background: 'var(--bg)',
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border-muted)',
                      height: ROW_HEIGHT,
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '0 12px',
                    }}
                  >
                    <Avatar name={row.displayName} size={20} />
                    <span style={{
                      fontSize: 13, fontWeight: 500, color: 'var(--fg)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {row.displayName}
                    </span>
                  </div>
                  {/* Day cells */}
                  <div
                    style={{
                      position: 'relative',
                      height: ROW_HEIGHT,
                      width: timelineWidth,
                      borderBottom: '1px solid var(--border-muted)',
                    }}
                  >
                    {ticks.map((t) => {
                      const iso = dayToIso(t.day);
                      const isLeave = leaveSet.has(iso);
                      const points = memMap.get(t.day) ?? 0;
                      const togglable = !t.isWeekend && !t.isHoliday;
                      // Background priority: leave (black) wins over
                      // holiday wins over weekend wins over load colour.
                      let bg: string;
                      if (isLeave) bg = 'var(--workload-leave)';
                      else if (t.isHoliday) bg = 'var(--workload-holiday)';
                      else if (t.isWeekend) bg = 'var(--workload-weekend)';
                      else bg = tokenForLoad(points);
                      // Slice 5: provisional layer applies only to
                      // working-day, non-leave cells (those are the
                      // only cells that carry a placed bar's load to
                      // begin with). Stripe sits *over* the load
                      // gradient via background-image.
                      const provTeams = !isLeave && togglable
                        ? provMap.get(t.day) ?? null
                        : null;
                      const isProvisional = provTeams != null;
                      const title = cellTitle(
                        row.displayName, iso, points,
                        t.isWeekend, t.isHoliday, t.holidayLabel, isLeave,
                        provTeams,
                      );
                      return (
                        <div
                          key={t.day}
                          role={togglable ? 'button' : undefined}
                          tabIndex={togglable ? 0 : undefined}
                          aria-label={togglable ? title : undefined}
                          onClick={togglable ? () => toggleMemberLeave(row.userId, iso) : undefined}
                          onKeyDown={togglable ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleMemberLeave(row.userId, iso);
                            }
                          } : undefined}
                          title={title}
                          style={{
                            position: 'absolute',
                            left: t.left,
                            width: DAY_PX,
                            height: ROW_HEIGHT,
                            background: bg,
                            // 6px diagonal-stripe overlay for cells fed
                            // by ≥1 team-greedy bar. Pattern colour
                            // comes from a token so the alpha lives in
                            // index.css, not here.
                            backgroundImage: isProvisional
                              ? 'repeating-linear-gradient(135deg, transparent 0, transparent 4px, var(--workload-provisional-stripe) 4px, var(--workload-provisional-stripe) 6px)'
                              : undefined,
                            borderRight: '1px solid var(--border-muted)',
                            cursor: togglable ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            outline: t.isToday ? '1px solid var(--accent)' : 'none',
                            outlineOffset: t.isToday ? -1 : 0,
                          }}
                        >
                          {isLeave && (
                            <span style={{
                              fontSize: 9, fontWeight: 700,
                              color: '#fff', lineHeight: 1,
                            }}>
                              L
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend — points scale + special-day swatches. Anchored to the
          bottom of the heatmap area so it scrolls with the page chrome,
          not with the matrix. */}
      <Legend />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend — separate component to keep the main render lean. Scale runs
// 0 → 7+, then a divider, then leave / weekend / holiday.
// ---------------------------------------------------------------------------

function Legend() {
  const scale: { label: string; bg: string }[] = [
    { label: '0', bg: 'var(--workload-0)' },
    { label: '1', bg: 'var(--workload-1)' },
    { label: '2', bg: 'var(--workload-2)' },
    { label: '3', bg: 'var(--workload-3)' },
    { label: '4', bg: 'var(--workload-4)' },
    { label: '5', bg: 'var(--workload-5)' },
    { label: '6', bg: 'var(--workload-6)' },
    { label: '7+', bg: 'var(--workload-7)' },
  ];
  const swatchSize = 14;
  return (
    <div
      style={{
        borderTop: '1px solid var(--border-muted)',
        padding: '8px 16px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        fontSize: 11, color: 'var(--fg-muted)',
        background: 'var(--bg)',
      }}
    >
      <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Pts/day
      </span>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {scale.map((s) => (
          <div
            key={s.label}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            title={`${s.label} pts`}
          >
            <span
              aria-hidden
              style={{
                width: swatchSize, height: swatchSize,
                background: s.bg,
                border: '1px solid var(--border-muted)',
                borderRadius: 3,
                display: 'inline-block',
              }}
            />
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <span style={{ width: 1, height: 16, background: 'var(--border-muted)' }} />
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Click a working-day cell to mark on leave">
        <span
          aria-hidden
          style={{
            width: swatchSize, height: swatchSize,
            background: 'var(--workload-leave)',
            border: '1px solid var(--border-muted)',
            borderRadius: 3,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', lineHeight: 1 }}>L</span>
        </span>
        <span>On leave</span>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span
          aria-hidden
          style={{
            width: swatchSize, height: swatchSize,
            background: 'var(--workload-weekend)',
            border: '1px solid var(--border-muted)',
            borderRadius: 3,
            display: 'inline-block',
          }}
        />
        <span>Weekend</span>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span
          aria-hidden
          style={{
            width: swatchSize, height: swatchSize,
            background: 'var(--workload-holiday)',
            border: '1px solid var(--border-muted)',
            borderRadius: 3,
            display: 'inline-block',
          }}
        />
        <span>Holiday</span>
      </div>
    </div>
  );
}

