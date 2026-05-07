// Pure / framework-free helpers shared by both gantts (planning + reality
// in `issues-gantt.tsx`, and the planner sandbox in `planner-gantt.tsx`).
//
// **Slice 4 (2026-05-06)** — extracted from `issues-gantt.tsx`. No React
// imports, no DOM access, no `Date.now()` calls outside the helpers that
// take a `today` argument. Adding the second consumer (PlannerGantt) means
// owning the day/week math and constants in one place; carrying two copies
// would drift the moment we tweak weekly thresholds or holiday handling.
//
// What lives here:
//   - Constants: `MS_PER_DAY`, `MONTH_NAMES`, `DOW`, `HOLIDAY_NAMES`.
//   - Day math: `toDayNumber`, `fromDayNumber`, `dayToIso`, `todayDay`.
//   - Range / span types + builders: `DayRange`, `MonthSpan`, `DayTick`,
//     `BarSpec`, `deriveRange`, `buildMonthSpans`, `buildDayTicks`.
//   - Bar derivation: `issueBar`, `deriveContainerBar`, `barFor`.
//   - Per-day load aggregation: `dailyLoadFor`.
//   - Status colour resolution: `statusColors`.
//   - Number formatting: `trimZeros`, `formatPpd`, `formatOverload`.
//
// What does NOT live here: the `IssuesGantt` / `IssueRow` / `GroupRow` /
// `BarEditPopover` / `TimelineBackdrop` React components. Those have
// planner-vs-reality semantics (mode prop, useIssues coupling, drag
// targets) baked in, and the planner gantt builds its own row + bar
// components that reuse the helpers above. Sharing the React layer would
// require a flag-based persistence switch — explicitly disallowed by
// `memory/project_planning_vs_reality_gantt.md`.

import { HOLIDAYS, isWorkingDate, type Issue } from '../fixtures';
import { STATUSES, type StatusId } from './shell';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MS_PER_DAY = 86_400_000;

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Display labels for entries in the global `HOLIDAYS` set. Used as the
 * tooltip on holiday day-cells in the gantt timeline. Kept here (not in
 * `fixtures.ts`) because this is presentation-side data — `HOLIDAYS` is
 * the load-bearing source-of-truth for working-day math; the names are a
 * UI affordance layered on top.
 */
export const HOLIDAY_NAMES: Record<string, string> = {
  '2026-05-01': 'Labour Day',
};

// ---------------------------------------------------------------------------
// Day math
// ---------------------------------------------------------------------------

export function toDayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNumber(day: number): Date {
  return new Date(day * MS_PER_DAY);
}

export function dayToIso(day: number): string {
  const d = fromDayNumber(day);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Today as the same day-number coordinate space the gantt renders in.
 *  Reads the local clock, which is a deliberate side-effect — callers
 *  that need purity should compute the day-number themselves and pass
 *  it through. */
export function todayDay(): number {
  const now = new Date();
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Range + tick math
// ---------------------------------------------------------------------------

export interface DayRange { start: number; end: number; }

export function deriveRange(issues: Issue[], today: number): DayRange {
  const days: number[] = [today];
  for (const i of issues) {
    if (i.startDate) days.push(toDayNumber(i.startDate));
    if (i.endDate) days.push(toDayNumber(i.endDate));
  }
  return { start: Math.min(...days) - 14, end: Math.max(...days) + 60 };
}

export interface MonthSpan { key: string; label: string; left: number; width: number; }

export function buildMonthSpans(range: DayRange, dayPx: number): MonthSpan[] {
  const out: MonthSpan[] = [];
  let cursor = range.start;
  while (cursor <= range.end) {
    const d = fromDayNumber(cursor);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const monthEndDate = new Date(Date.UTC(y, m + 1, 0));
    const monthEndDay = Math.floor(monthEndDate.getTime() / MS_PER_DAY);
    const spanEnd = Math.min(monthEndDay, range.end);
    const left = (cursor - range.start) * dayPx;
    const width = (spanEnd - cursor + 1) * dayPx;
    out.push({
      key: `${y}-${m}`,
      label: `${MONTH_NAMES[m]} ${y}`,
      left,
      width,
    });
    cursor = spanEnd + 1;
  }
  return out;
}

export interface DayTick {
  day: number;
  left: number;
  isToday: boolean;
  isWeekend: boolean;
  /** True for any HOLIDAYS entry — rendered like a weekend in the backdrop. */
  isHoliday: boolean;
  isWeekStart: boolean;
  primaryLabel: string;
  secondaryLabel: string;
  /** Holiday name for the tooltip, when applicable. */
  holidayLabel?: string;
}

export function buildDayTicks(range: DayRange, dayPx: number, today: number, weekly: boolean): DayTick[] {
  const out: DayTick[] = [];
  for (let day = range.start; day <= range.end; day++) {
    const d = fromDayNumber(day);
    const dow = d.getUTCDay();
    const isWeekStart = dow === 1;
    if (weekly && !isWeekStart) continue;
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const isHoliday = HOLIDAYS.has(iso);
    out.push({
      day,
      left: (day - range.start) * dayPx,
      isToday: day === today,
      isWeekend: dow === 0 || dow === 6,
      isHoliday,
      isWeekStart,
      primaryLabel: weekly ? `${d.getUTCDate()}` : `${d.getUTCDate()}`,
      secondaryLabel: weekly ? MONTH_NAMES[d.getUTCMonth()] : DOW[dow],
      holidayLabel: isHoliday ? (HOLIDAY_NAMES[iso] ?? 'Holiday') : undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bar derivation
// ---------------------------------------------------------------------------

export interface BarSpec {
  startDay: number;
  endDay: number;
  hasStart: boolean;
  hasEnd: boolean;
}

export function issueBar(issue: Issue): BarSpec | null {
  const hasStart = !!issue.startDate;
  const hasEnd = !!issue.endDate;
  if (!hasStart && !hasEnd) return null;
  const startDay = hasStart ? toDayNumber(issue.startDate!) : toDayNumber(issue.endDate!);
  const endDay = hasEnd ? toDayNumber(issue.endDate!) : toDayNumber(issue.startDate!);
  return { startDay, endDay, hasStart, hasEnd };
}

// Derive a Story/Epic bar from the leaves (Task/Bug) underneath it. Walks the
// whole subtree because a Task/Bug can sit under a Story under an Epic, and a
// Task/Bug can also be a direct child of an Epic. Returns null if no leaf in
// the subtree carries a date — Stories/Epics never set their own dates in v1.
export function deriveContainerBar(issue: Issue, lookup: Map<string, Issue>): BarSpec | null {
  if (issue.type !== 'S' && issue.type !== 'E') return null;
  let min = Infinity;
  let max = -Infinity;
  let anyStart = false;
  let anyEnd = false;
  const visit = (id: string) => {
    const node = lookup.get(id);
    if (!node) return;
    if (node.type === 'T' || node.type === 'B') {
      const b = issueBar(node);
      if (b) {
        if (b.startDay < min) min = b.startDay;
        if (b.endDay > max) max = b.endDay;
        anyStart ||= b.hasStart;
        anyEnd ||= b.hasEnd;
      }
    }
    if (node.children) for (const c of node.children) visit(c);
  };
  if (issue.children) for (const c of issue.children) visit(c);
  if (!isFinite(min)) return null;
  return { startDay: min, endDay: max, hasStart: anyStart, hasEnd: anyEnd };
}

export function barFor(issue: Issue, lookup: Map<string, Issue>): BarSpec | null {
  if (issue.type === 'T' || issue.type === 'B') return issueBar(issue);
  return deriveContainerBar(issue, lookup);
}

// ---------------------------------------------------------------------------
// Per-day load aggregation
// ---------------------------------------------------------------------------

/**
 * Sum a group's per-day load (in points). For each leaf item with a
 * positive estimate and both dates, distribute the estimate across
 * working days in the span and accumulate per day. Returns a map keyed
 * by absolute day-number → total points scheduled for that day across
 * all items in the group. Skips weekends, holidays, and items with no
 * working day in their span.
 *
 * Used when the Gantt is grouped by assignee — each group's items are
 * the assignee's leaves, so this directly produces the assignee's daily
 * workload.
 */
export function dailyLoadFor(items: Issue[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const issue of items) {
    if (issue.type !== 'T' && issue.type !== 'B') continue;
    if (!issue.startDate || !issue.endDate || !issue.estimate || issue.estimate <= 0) continue;
    const startDay = toDayNumber(issue.startDate);
    const endDay = toDayNumber(issue.endDate);
    if (endDay < startDay) continue;
    const workingDays: number[] = [];
    for (let d = startDay; d <= endDay; d++) {
      if (isWorkingDate(fromDayNumber(d))) workingDays.push(d);
    }
    if (workingDays.length === 0) continue;
    const ppd = issue.estimate / workingDays.length;
    for (const d of workingDays) out.set(d, (out.get(d) ?? 0) + ppd);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

export function statusColors(status: StatusId | string) {
  const s = STATUSES.find((x) => x.id === status);
  return {
    bg: s?.bg ?? 'var(--bg-muted)',
    fg: s?.color ?? 'var(--fg)',
  };
}

// Trim trailing zeros so "4.0" reads as "4" without losing precision when
// the user has actually entered or arrived at a fractional value.
export function trimZeros(s: string): string {
  return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function formatPpd(ppd: number): string {
  return trimZeros((Math.round(ppd * 10) / 10).toString());
}

export function formatOverload(overload: number): string {
  return `${trimZeros((Math.round(overload * 10) / 10).toString())}×`;
}
