// Demo data used by the prototype. No real persistence beyond what the
// `ProjectsProvider` writes to localStorage for user-created projects.

// ---------------------------------------------------------------------------
// Issue types + statuses (data only — UI rendering lives in shell.tsx)
// ---------------------------------------------------------------------------

export type IssueTypeLetter = 'T' | 'B' | 'S' | 'E';

export const ISSUE_TYPE_NAMES: Record<IssueTypeLetter, string> = {
  T: 'Task', B: 'Bug', S: 'Story', E: 'Epic',
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface Project {
  /** URL slug. Lowercase a-z, 0-9, dashes. Unique per workspace. */
  slug: string;
  name: string;
  /** Prefix for issue IDs (CMT, ORB, ATL). Unique per workspace, ≤4 chars. */
  key: string;
  /** Letter shown inside the small project chip. */
  letter: string;
  /** Foreground color of the chip — drawn from `PROJECT_PALETTE`. */
  color: string;
  /** Background color of the chip — pairs with `color`. */
  bg: string;
  description: string;
  status: 'active' | 'archived';
  /** ISO timestamp. Set when the project was created. */
  createdAt: string;
  /** Email of the workspace member who created the project. */
  createdByEmail: string;
  /** Per-issue-type workflow assignment. */
  workflows: Record<IssueTypeLetter, string>;
  /** Slugs of teams whose members inherit access to this project. */
  teamSlugs: string[];
  /** Emails of individuals with explicit access (in addition to team members). */
  userEmails: string[];
}

/**
 * Kept as a string alias so existing import sites keep compiling. Runtime
 * narrowing now goes through `useProjects().getProject(slug)`.
 */
export type ProjectSlug = string;

/**
 * Color palette used to auto-pick a chip color when a user creates a new
 * project. Seeded projects pick a hand-chosen entry from the same palette.
 */
export const PROJECT_PALETTE: Array<{ color: string; bg: string }> = [
  { color: '#4f46e5', bg: '#e0e7ff' }, // indigo
  { color: '#0891b2', bg: '#cffafe' }, // cyan
  { color: '#16a34a', bg: '#dcfce7' }, // green
  { color: '#ea580c', bg: '#fed7aa' }, // orange
  { color: '#9333ea', bg: '#f3e8ff' }, // purple
  { color: '#db2777', bg: '#fce7f3' }, // pink
  { color: '#ca8a04', bg: '#fef3c7' }, // amber
  { color: '#0d9488', bg: '#ccfbf1' }, // teal
];

/** Stable hash → palette index. Same slug always picks the same color. */
export function pickProjectColor(slug: string): { color: string; bg: string } {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = ((h << 5) - h) + slug.charCodeAt(i);
    h |= 0;
  }
  return PROJECT_PALETTE[Math.abs(h) % PROJECT_PALETTE.length];
}

/**
 * Workspace-default seed projects. Shaped exactly like what the create-project
 * form produces, so seeded projects render identically to user-added ones.
 */
export const SEED_PROJECTS: Project[] = [
  {
    slug: 'comet',
    name: 'Comet',
    key: 'CMT',
    letter: 'C',
    color: '#4f46e5',
    bg: '#e0e7ff',
    description: 'Internal issue tracker. Self-hostable, role-aware, opinionated about workflows.',
    status: 'active',
    createdAt: '2025-09-12T10:30:00.000Z',
    createdByEmail: 'jordan@acme.com',
    workflows: { T: 'default', B: 'default', S: 'default', E: 'epic-coarse' },
    teamSlugs: ['backend', 'frontend'],
    userEmails: ['priya@acme.com'],
  },
  {
    slug: 'orbit',
    name: 'Orbit',
    key: 'ORB',
    letter: 'O',
    color: '#0891b2',
    bg: '#cffafe',
    description: 'Customer-facing dashboard and analytics.',
    status: 'active',
    createdAt: '2025-10-04T14:15:00.000Z',
    createdByEmail: 'jordan@acme.com',
    workflows: { T: 'default', B: 'default', S: 'default', E: 'epic-coarse' },
    teamSlugs: ['frontend'],
    userEmails: ['sam@acme.com'],
  },
  {
    slug: 'atlas',
    name: 'Atlas',
    key: 'ATL',
    letter: 'A',
    color: '#16a34a',
    bg: '#dcfce7',
    description: 'Map / geospatial features for the platform.',
    status: 'active',
    createdAt: '2025-11-21T09:00:00.000Z',
    createdByEmail: 'maya@acme.com',
    workflows: { T: 'default', B: 'default', S: 'default', E: 'epic-detailed' },
    teamSlugs: ['backend', 'design'],
    userEmails: ['priya@acme.com'],
  },
  {
    slug: 'halo',
    name: 'Halo',
    key: 'HAL',
    letter: 'H',
    color: '#6b7280',
    bg: '#f3f4f6',
    description: 'Deprecated. Kept for reference only.',
    status: 'archived',
    createdAt: '2024-03-15T12:00:00.000Z',
    createdByEmail: 'jordan@acme.com',
    workflows: { T: 'default', B: 'default', S: 'default', E: 'epic-coarse' },
    teamSlugs: [],
    userEmails: [],
  },
];

/** Slugs that can't be used for projects because they're route-reserved. */
export const RESERVED_PROJECT_SLUGS = new Set<string>([
  'inbox', 'my-issues', 'all-issues', 'projects', 'workflows', 'teams', 'settings', 'u',
]);

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export interface Issue {
  id: string;
  type: IssueTypeLetter;
  title: string;
  status: 'backlog' | 'todo' | 'in-progress' | 'in-review' | 'done' | 'canceled';
  priority: 'urgent' | 'high' | 'med' | 'low' | 'none';
  assignee: string;
  labels: string[];
  updated: string;
  estimate?: number;
  /** Slug of the project that owns this issue. Drives the URL of issue detail. */
  project: ProjectSlug;
  /**
   * ISO date (YYYY-MM-DD). Optional — backlog/todo issues typically don't
   * have a start date until someone picks them up.
   */
  startDate?: string;
  /** ISO date (YYYY-MM-DD). The target / due date for the issue. Optional. */
  endDate?: string;
  /**
   * Parent issue id. Hierarchy rules (see docs/product.md):
   *   Epic → Story → Task/Bug, plus Epic → Task/Bug.
   *   Stories parent under Epics; Tasks/Bugs under either Epic or Story.
   *   Epics never have a parent.
   * Storage is denormalised — the parent's `children` array also carries
   * this issue's id. Both sides must stay in sync.
   */
  parent?: string;
  /**
   * Direct child issue ids. Mirror of `parent` on the other side; both
   * are stored so we can render either direction without a scan.
   */
  children?: string[];
  /**
   * Symmetric "relates to" link between two issues. If A.relatedTo
   * contains B, then B.relatedTo contains A. Untyped beyond the verb.
   */
  relatedTo?: string[];
  /**
   * Directed "depends on" predecessors — Task-only. If A.dependsOn
   * contains B, A cannot start until B has ended; equivalently, B
   * blocks A. Storage is symmetric for fast inverse lookup: B's
   * `dependedOnBy` contains A. The relation graph must be a DAG —
   * cycles are rejected at edit time. Only valid when both ends
   * have `type === 'T'`.
   */
  dependsOn?: string[];
  /** Inverse of `dependsOn` — successors / Tasks that this Task blocks. */
  dependedOnBy?: string[];
  /**
   * Theme ids the issue is grouped under. Mirror of `Theme.issues`;
   * both sides are stored.
   */
  themes?: string[];
  /**
   * Long-form body of the issue. Rendered with `renderRichText` so triple-
   * backtick fenced code blocks survive; everything else is plain text with
   * preserved whitespace. Optional — issues without a description fall to
   * an "Add a description" empty state.
   */
  description?: string;
}

// Today (in this prototype's reference frame) is 2026-04-27. Dates below are
// hand-tuned around it: backlog usually has no start date, in-progress /
// in-review have a start date and a target end, done has both filled in.
//
// Hierarchy + relations + theme membership are stored on BOTH ends. If you
// touch one side (parent/child, relatedTo, themes), update the other side
// too — there's no auto-mirroring.
export const ISSUES: Issue[] = [
  // --- Comet ---
  { id: 'CMT-241', project: 'comet', type: 'B', title: 'Reorder of states corrupts saved view state when filter is active', status: 'in-review', priority: 'urgent', assignee: 'Maya Chen', labels: ['regression', 'workflow'], updated: '2h ago', estimate: 3, startDate: '2026-04-22', endDate: '2026-04-29', relatedTo: ['CMT-229'], themes: ['THM-2'], description: `Saving the workflow editor's view state (filter chips, expanded sections) writes through a debounced effect. When a state node is reordered while a filter is active, the persisted slot order is computed from the visible subset and reapplied to the full set on reload — silently dropping nodes that were filtered out.

Repro:
1. Open /comet/workflow
2. Apply filter type:terminal
3. Drag any visible node to a new position
4. Reload — non-terminal states are missing from the saved order

Suspected fix is to reorder over the *full* set, not the filtered subset:

\`\`\`ts
const persist = debounce((view) => {
  const next = mergeOrder(allNodes, view.visibleOrder);
  storage.set('workflow:order', next);
}, 250);
\`\`\`` },
  { id: 'CMT-238', project: 'comet', type: 'S', title: 'Allow workspace admins to fork the default workflow per project', status: 'in-progress', priority: 'high', assignee: 'Jordan Lee', labels: ['workflow', 'admin'], updated: '4h ago', estimate: 8, parent: 'CMT-232' },
  { id: 'CMT-237', project: 'comet', type: 'T', title: 'Document the 5 transition rule types in /help', status: 'todo', priority: 'med', assignee: 'Priya Rao', labels: ['docs'], updated: 'yesterday', estimate: 2, endDate: '2026-05-04', parent: 'CMT-232', themes: ['THM-2'], dependsOn: ['CMT-234'] },
  { id: 'CMT-235', project: 'comet', type: 'B', title: 'Self-loop edges render outside node hit area at zoom < 60%', status: 'todo', priority: 'low', assignee: 'Maya Chen', labels: ['workflow'], updated: '2d ago', estimate: 1, themes: ['THM-2'] },
  { id: 'CMT-234', project: 'comet', type: 'T', title: 'Add bulk-edit support for status and assignee on board view', status: 'in-progress', priority: 'high', assignee: 'Sam Park', labels: ['board'], updated: '1d ago', estimate: 5, startDate: '2026-04-20', endDate: '2026-05-01', dependedOnBy: ['CMT-237'] },
  { id: 'CMT-232', project: 'comet', type: 'E', title: 'Custom field schema per project', status: 'backlog', priority: 'high', assignee: 'Jordan Lee', labels: ['fields', 'q3'], updated: '3d ago', estimate: 21, children: ['CMT-238', 'CMT-237', 'CMT-230', 'CMT-223', 'CMT-220'] },
  { id: 'CMT-230', project: 'comet', type: 'S', title: 'Auto-archive Done issues after 30 days', status: 'in-review', priority: 'med', assignee: 'Sam Park', labels: ['retention'], updated: '5h ago', estimate: 3, parent: 'CMT-232' },
  { id: 'CMT-229', project: 'comet', type: 'B', title: 'Cycle detection misses A→B→A back-edges in graph linter', status: 'in-progress', priority: 'urgent', assignee: 'Maya Chen', labels: ['workflow'], updated: '8h ago', estimate: 5, startDate: '2026-04-24', endDate: '2026-04-28', relatedTo: ['CMT-241'], themes: ['THM-2'] },
  { id: 'CMT-227', project: 'comet', type: 'T', title: 'Slug validation on workspace creation', status: 'done', priority: 'med', assignee: 'Priya Rao', labels: ['onboarding'], updated: '1d ago', estimate: 2, startDate: '2026-04-21', endDate: '2026-04-25' },
  { id: 'CMT-225', project: 'comet', type: 'B', title: 'Empty state on inbox triggers layout flash on first load', status: 'todo', priority: 'low', assignee: 'Sam Park', labels: ['frontend'], updated: '4d ago', estimate: 2, themes: ['THM-1'] },
  { id: 'CMT-223', project: 'comet', type: 'S', title: 'Slack-style /commands in comments', status: 'backlog', priority: 'med', assignee: 'Jordan Lee', labels: ['comments'], updated: '1w ago', estimate: 8, parent: 'CMT-232' },
  { id: 'CMT-220', project: 'comet', type: 'T', title: 'Export workflow as YAML', status: 'backlog', priority: 'low', assignee: 'Priya Rao', labels: ['workflow'], updated: '1w ago', estimate: 3, parent: 'CMT-232' },

  // --- Orbit ---
  { id: 'ORB-58', project: 'orbit', type: 'S', title: 'Render top-of-funnel chart with project-level filter', status: 'in-progress', priority: 'high', assignee: 'Jordan Lee', labels: ['analytics'], updated: '1h ago', estimate: 5, parent: 'ORB-40', children: ['ORB-52'], relatedTo: ['ORB-55'] },
  { id: 'ORB-55', project: 'orbit', type: 'B', title: 'Date-range picker drops timezone offset on apply', status: 'in-review', priority: 'urgent', assignee: 'Riley Singh', labels: ['regression', 'analytics'], updated: '3h ago', estimate: 2, startDate: '2026-04-25', endDate: '2026-04-28', relatedTo: ['ORB-58'] },
  { id: 'ORB-52', project: 'orbit', type: 'T', title: 'Add CSV export for cohort table', status: 'todo', priority: 'med', assignee: 'Jordan Lee', labels: ['exports'], updated: '6h ago', estimate: 3, endDate: '2026-05-10', parent: 'ORB-58', dependsOn: ['ORB-32'] },
  { id: 'ORB-49', project: 'orbit', type: 'B', title: 'Loading spinner persists after error response', status: 'todo', priority: 'low', assignee: 'Avery Kim', labels: ['frontend'], updated: '2d ago', estimate: 1, themes: ['THM-1'] },
  { id: 'ORB-44', project: 'orbit', type: 'S', title: 'Per-user retention view on dashboard', status: 'backlog', priority: 'med', assignee: 'Riley Singh', labels: ['analytics', 'retention'], updated: '4d ago', estimate: 8, parent: 'ORB-40' },
  { id: 'ORB-40', project: 'orbit', type: 'E', title: 'Cohort analysis revamp', status: 'backlog', priority: 'high', assignee: 'Jordan Lee', labels: ['q3', 'analytics'], updated: '1w ago', estimate: 21, children: ['ORB-58', 'ORB-44', 'ORB-32'] },
  { id: 'ORB-32', project: 'orbit', type: 'T', title: 'Tighten type-safety on event schema', status: 'done', priority: 'low', assignee: 'Sam Park', labels: ['refactor'], updated: '3d ago', estimate: 2, startDate: '2026-04-17', endDate: '2026-04-24', parent: 'ORB-40', dependedOnBy: ['ORB-52'] },

  // --- Atlas ---
  // Demo Epic with a small DAG of Task dependencies — useful for verifying
  // the "depends on" picker, cycle rejection, and how derived Story/Epic
  // bars roll up over a sequenced set of leaves on the Gantt.
  //
  //   ATL-131 ──► ATL-132 ──► ATL-133 ──┐
  //                     │                ├──► ATL-135 ──► ATL-136
  //                     └──► ATL-134 ────┘
  //
  // Dates respect the dependency order, the working-week policy
  // (Mon-Fri only), and the seeded HOLIDAYS list (May 1 is Labour Day,
  // skipped). Estimates honour ~4 pts/day. ATL-131 is in-progress
  // (today is 2026-04-29); the rest sit in backlog awaiting predecessors.
  { id: 'ATL-136', project: 'atlas', type: 'T', title: 'QA pass on device farm against new tile format', status: 'backlog', priority: 'med', assignee: 'Sam Park', labels: ['qa', 'offline'], updated: '1d ago', estimate: 4, startDate: '2026-05-15', endDate: '2026-05-18', parent: 'ATL-130', dependsOn: ['ATL-135'] },
  { id: 'ATL-135', project: 'atlas', type: 'T', title: 'Add compaction metrics + Grafana panels', status: 'backlog', priority: 'med', assignee: 'Avery Kim', labels: ['observability'], updated: '1d ago', estimate: 6, startDate: '2026-05-12', endDate: '2026-05-14', parent: 'ATL-130', dependsOn: ['ATL-133', 'ATL-134'], dependedOnBy: ['ATL-136'] },
  { id: 'ATL-134', project: 'atlas', type: 'T', title: 'Update tile reader to handle compacted format', status: 'backlog', priority: 'high', assignee: 'Priya Rao', labels: ['offline', 'reader'], updated: '1d ago', estimate: 8, startDate: '2026-05-07', endDate: '2026-05-11', parent: 'ATL-130', dependsOn: ['ATL-132'], dependedOnBy: ['ATL-135'] },
  { id: 'ATL-133', project: 'atlas', type: 'T', title: 'Migrate stored tiles to compacted format in place', status: 'backlog', priority: 'high', assignee: 'Maya Chen', labels: ['offline', 'migration'], updated: '1d ago', estimate: 8, startDate: '2026-05-07', endDate: '2026-05-11', parent: 'ATL-130', dependsOn: ['ATL-132'], dependedOnBy: ['ATL-135'] },
  // ATL-132 starts Mon May 4 because Fri May 1 is a holiday (Labour Day).
  { id: 'ATL-132', project: 'atlas', type: 'T', title: 'Implement compaction algorithm', status: 'backlog', priority: 'high', assignee: 'Maya Chen', labels: ['offline'], updated: '1d ago', estimate: 12, startDate: '2026-05-04', endDate: '2026-05-06', parent: 'ATL-130', dependsOn: ['ATL-131'], dependedOnBy: ['ATL-133', 'ATL-134'] },
  { id: 'ATL-131', project: 'atlas', type: 'T', title: 'Audit current cache schema and pick compaction target', status: 'in-progress', priority: 'high', assignee: 'Maya Chen', labels: ['offline', 'spike'], updated: '2h ago', estimate: 4, startDate: '2026-04-29', endDate: '2026-04-30', parent: 'ATL-130', dependedOnBy: ['ATL-132'] },
  { id: 'ATL-130', project: 'atlas', type: 'E', title: 'Offline tile compaction', status: 'in-progress', priority: 'high', assignee: 'Maya Chen', labels: ['offline', 'q2'], updated: '2h ago', estimate: 42, children: ['ATL-131', 'ATL-132', 'ATL-133', 'ATL-134', 'ATL-135', 'ATL-136'] },
  // Fire-drill bug for Maya — overlaps ATL-118 + ATL-131 on Apr 29-30 to
  // demo the per-assignee daily-load overlay (Maya hits ~6 pts/day on
  // those two days, 1.5× the 4/day ideal).
  { id: 'ATL-119', project: 'atlas', type: 'B', title: 'Tile prefetch corrupts cache index on simultaneous writes', status: 'in-progress', priority: 'urgent', assignee: 'Maya Chen', labels: ['offline', 'regression'], updated: '15m ago', estimate: 6, startDate: '2026-04-29', endDate: '2026-04-30' },
  { id: 'ATL-118', project: 'atlas', type: 'B', title: 'Map tiles fail to load when offline cache is full', status: 'in-progress', priority: 'urgent', assignee: 'Maya Chen', labels: ['offline', 'map'], updated: '45m ago', estimate: 5, startDate: '2026-04-26', endDate: '2026-04-30', themes: ['THM-1', 'THM-3'] },
  { id: 'ATL-115', project: 'atlas', type: 'S', title: 'Pinch-zoom acceleration curve on mobile', status: 'in-review', priority: 'med', assignee: 'Jordan Lee', labels: ['mobile', 'map'], updated: '2h ago', estimate: 3, parent: 'ATL-100', themes: ['THM-3'] },
  { id: 'ATL-112', project: 'atlas', type: 'T', title: 'Migrate icon set to Lucide v2', status: 'todo', priority: 'low', assignee: 'Priya Rao', labels: ['frontend'], updated: '1d ago', estimate: 2, endDate: '2026-05-15' },
  { id: 'ATL-110', project: 'atlas', type: 'S', title: 'Cluster overlay markers above zoom 14', status: 'todo', priority: 'high', assignee: 'Jordan Lee', labels: ['map'], updated: '2d ago', estimate: 5, parent: 'ATL-100', themes: ['THM-3'] },
  { id: 'ATL-104', project: 'atlas', type: 'B', title: 'GPX import drops elevation column', status: 'backlog', priority: 'med', assignee: 'Avery Kim', labels: ['imports'], updated: '5d ago', estimate: 3 },
  { id: 'ATL-100', project: 'atlas', type: 'E', title: 'Real-time location sharing for teams', status: 'backlog', priority: 'high', assignee: 'Maya Chen', labels: ['q4', 'collaboration'], updated: '2w ago', estimate: 34, children: ['ATL-115', 'ATL-110'] },
  { id: 'ATL-98',  project: 'atlas', type: 'T', title: 'Tile server health check endpoint', status: 'done', priority: 'med', assignee: 'Sam Park', labels: ['ops'], updated: '6d ago', estimate: 2, startDate: '2026-04-14', endDate: '2026-04-21' },
];

export const issueById = (id: string) => ISSUES.find((i) => i.id === id);

/**
 * Working week — Mon-Fri only. Saturday and Sunday are non-working
 * days and don't count toward effort capacity, working-day spans, or
 * the velocity math. Single project-agnostic policy for v1; per-region
 * weekend variations are deferred.
 *
 * Values are JS getUTCDay() indexes: 0 = Sun, 1 = Mon, …, 6 = Sat.
 */
export const WORKING_WEEKDAYS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5]);
export const WORKING_DAYS_PER_WEEK = 5;

/**
 * Calendar holidays — ISO `YYYY-MM-DD` strings. Treated like weekends
 * by every working-day helper: nothing is delivered on these dates and
 * they don't count toward capacity or effort spans. v1 uses a single
 * tenant-agnostic list; per-tenant / per-region holiday calendars are
 * deferred. Each entry should be the date the holiday falls on, not a
 * window — multi-day breaks are listed as multiple entries.
 *
 * Maintained alphabetically by date so additions are easy to reason
 * about. Reference frame: see comment above ISSUES (today is
 * 2026-04-29 in this prototype).
 */
export const HOLIDAYS: ReadonlySet<string> = new Set([
  '2026-05-01', // Labour Day
]);

/**
 * Ideal effort delivered by one assignee in a single **working day**,
 * in the same units as `Issue.estimate`. Working day = Mon-Fri minus
 * any date in `HOLIDAYS`. Used to translate effort points into
 * working-day estimates ("≈ N working days at 4/day") on the
 * inspector and in future capacity views. Single project-agnostic
 * constant for v1 — no per-team or per-assignee overrides.
 */
export const IDEAL_POINTS_PER_DAY = 4;

/**
 * Is the given ISO date (YYYY-MM-DD) a working day? False on
 * Sat/Sun and on any date in `HOLIDAYS`.
 */
export function isWorkingDay(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return false;
  if (HOLIDAYS.has(iso)) return false;
  return WORKING_WEEKDAYS.has(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

/** Same as `isWorkingDay` but takes a UTC `Date` directly. */
export function isWorkingDate(date: Date): boolean {
  if (!WORKING_WEEKDAYS.has(date.getUTCDay())) return false;
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return !HOLIDAYS.has(`${yy}-${mm}-${dd}`);
}

/**
 * Count working days in the inclusive range [`startIso`, `endIso`].
 * Returns 0 if `endIso < startIso`. Sat/Sun and holidays never count.
 */
export function workingDaysBetween(startIso: string, endIso: string): number {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  const MS_PER_DAY = 86_400_000;
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  if (end < start) return 0;
  let count = 0;
  for (let t = start; t <= end; t += MS_PER_DAY) {
    if (isWorkingDate(new Date(t))) count++;
  }
  return count;
}

/**
 * Compares a Task's effort against its scheduled working-day span and
 * reports the per-day load. Returns null when load can't be computed
 * (no estimate, missing date, end before start, span entirely on
 * non-working days).
 *
 * `overload` is `pointsPerDay / IDEAL_POINTS_PER_DAY`. > 1.0 means the
 * assignee would have to deliver more than the ideal velocity to hit
 * the dates as drawn — flagged visually in the Gantt and inspector so
 * it's obvious without doing the arithmetic.
 */
export interface TaskLoad {
  estimate: number;
  workingDays: number;
  pointsPerDay: number;
  overload: number;
}
export function computeTaskLoad(
  estimate: number | undefined,
  startIso: string | undefined,
  endIso: string | undefined,
): TaskLoad | null {
  if (estimate === undefined || estimate <= 0) return null;
  if (!startIso || !endIso) return null;
  const wd = workingDaysBetween(startIso, endIso);
  if (wd <= 0) return null;
  const pointsPerDay = estimate / wd;
  return {
    estimate,
    workingDays: wd,
    pointsPerDay,
    overload: pointsPerDay / IDEAL_POINTS_PER_DAY,
  };
}

/**
 * Add `n` working days to an ISO date and return a new ISO date.
 * `addWorkingDays('2026-05-08' /* Fri *‍/, 1) === '2026-05-11'` (Mon).
 * Skips weekends and holidays. Negative `n` walks backward. `n === 0`
 * returns the same date even if it lands on a non-working day (no
 * snapping).
 */
export function addWorkingDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const MS_PER_DAY = 86_400_000;
  let cursor = Date.UTC(y, m - 1, d);
  if (n === 0) return iso;
  const step = n > 0 ? MS_PER_DAY : -MS_PER_DAY;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    cursor += step;
    if (isWorkingDate(new Date(cursor))) remaining--;
  }
  const dt = new Date(cursor);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Would adding the directed edge `from -> to` (i.e. `from` depends on `to`)
 * create a cycle in the depends-on graph? Walks `to`'s transitive
 * `dependsOn` set and reports true if `from` is reachable.
 *
 * The graph passed in is `Map<id, predecessorIds>` — pass in the live state
 * (fixture + any session overrides) so the check reflects what the user is
 * actually seeing. `from`/`to` need not exist in the map yet (a Task with no
 * deps simply has an empty/missing entry).
 */
export function dependsOnWouldCycle(
  fromId: string,
  toId: string,
  predecessors: Map<string, string[]>,
): boolean {
  if (fromId === toId) return true;
  const seen = new Set<string>();
  const stack = [toId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === fromId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const preds = predecessors.get(cur) ?? [];
    for (const p of preds) stack.push(p);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------
//
// Themes are an orthogonal grouping (see docs/product.md). Flat — no parent
// theme, no child theme — and connect to issues many-to-many. Storage is
// symmetric: each `Theme.issues` entry must be present in the corresponding
// `Issue.themes` array.

export interface Theme {
  id: string;
  name: string;
  description: string;
  /** Foreground color for the theme chip. */
  color: string;
  /** Background color for the theme chip. */
  bg: string;
  /** Issue ids this theme groups. Mirror of `Issue.themes`. */
  issues: string[];
}

export const THEMES: Theme[] = [
  {
    id: 'THM-1', name: 'Performance',
    description: 'Make every surface feel instant — fewer layout shifts, faster first paint, no spinning forever.',
    color: '#0d9488', bg: '#ccfbf1',
    issues: ['ORB-49', 'ATL-118', 'CMT-225'],
  },
  {
    id: 'THM-2', name: 'Workflow polish',
    description: 'Round off rough edges in the workflow editor: cycles, filters, persistence quirks.',
    color: '#4f46e5', bg: '#e0e7ff',
    issues: ['CMT-241', 'CMT-229', 'CMT-235', 'CMT-237'],
  },
  {
    id: 'THM-3', name: 'Mobile-first',
    description: 'Tighten core flows for tablet and phone form factors before the v1 launch.',
    color: '#ea580c', bg: '#ffedd5',
    issues: ['ATL-115', 'ATL-118', 'ATL-110'],
  },
];

export const themeById = (id: string) => THEMES.find((t) => t.id === id);

// ---------------------------------------------------------------------------
// Current user
// ---------------------------------------------------------------------------

export const CURRENT_USER = {
  name: 'Jordan Lee',
  email: 'jordan@acme.com',
};

// ---------------------------------------------------------------------------
// Tenants + Workspaces
// ---------------------------------------------------------------------------
//
// In-flight refactor (2026-04): tenant level sits above workspace. Every
// in-app screen runs inside a single (tenant, workspace) pair derived from
// the URL (`useTenantContext()` in shell.tsx). Phase 0 only sets up the
// data model + URL plumbing; tenant picker UI, settings, membership reshape
// are later phases.

/**
 * Shared role ladder used at both tenant and workspace level: read < write < admin.
 * `TenantRole` and `WorkspaceRole` are kept as aliases — the structure is the
 * same, but call sites read clearer when the level is named.
 */
export type Role = 'admin' | 'write' | 'read';
export type TenantRole = Role;

export interface Tenant {
  /** URL slug. Lowercase a-z, 0-9, dashes. Globally unique. */
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
  /** Counts shown on the picker — hardcoded in the prototype. */
  workspaceCount: number;
  memberCount: number;
  /** Effective tenant role of the current user. */
  role: TenantRole;
  /** Active/deactivated lifecycle state. Optional — absent on fixture seeds. */
  status?: 'active' | 'deactivated';
}

export const TENANTS: Tenant[] = [
  {
    slug: 'dreamstreet',
    name: 'DreamStreet',
    letter: 'D',
    color: '#4f46e5',
    bg: '#e0e7ff',
    workspaceCount: 0,
    memberCount: 1,
    role: 'admin',
  },
  {
    slug: 'acme-corp',
    name: 'Acme Corp',
    letter: 'A',
    color: '#0891b2',
    bg: '#cffafe',
    workspaceCount: 3,
    memberCount: 6,
    role: 'admin',
  },
];

export const RESERVED_TENANT_SLUGS = new Set<string>([
  'login', 'setup', 'invite', 'tenants', 'workspaces', 'design-canvas', 'profile',
]);

/**
 * Workspace-level role for the current user. Ordered ladder:
 * `read < write < admin`. Higher implies lower (write implies read,
 * admin implies write). Resolution rules — see CLAUDE.md / memory:
 * explicit user assignment overrides team grants in either direction;
 * team grants combine via union (highest team role wins); admin is only
 * ever assigned explicitly to a user, never inherited from a team.
 */
export type WorkspaceRole = Role;

export interface Workspace {
  /** Tenant this workspace belongs to. */
  tenantSlug: string;
  /** URL slug: lowercase a-z, 0-9, dashes. The workspace primary key within a tenant. */
  slug: string;
  name: string;
  /** Letter shown inside the workspace avatar. */
  letter: string;
  color: string;
  bg: string;
  /** Counts shown on the picker — hardcoded in the prototype. */
  projectCount: number;
  memberCount: number;
  /** Effective role of the current user in this workspace. */
  role: WorkspaceRole;
  /**
   * Soft-delete state. Archived workspaces are hidden from the default
   * picker view and frozen against further mutation. The picker exposes a
   * "Show archived" toggle for users who need to view or restore them.
   * Mirrors `workspaces.status` ('active' | 'archived') on the backend.
   */
  archived?: boolean;
}

export const WORKSPACES: Workspace[] = [
  {
    tenantSlug: 'acme-corp',
    slug: 'acme', name: 'Acme Robotics', letter: 'A',
    color: '#4f46e5', bg: '#e0e7ff',
    projectCount: 4, memberCount: 6, role: 'admin',
  },
  {
    tenantSlug: 'acme-corp',
    slug: 'nimbus', name: 'Nimbus Labs', letter: 'N',
    color: '#0891b2', bg: '#cffafe',
    projectCount: 2, memberCount: 11, role: 'write',
  },
  {
    tenantSlug: 'acme-corp',
    slug: 'polar', name: 'Polar Tooling', letter: 'P',
    color: '#9333ea', bg: '#f3e8ff',
    projectCount: 7, memberCount: 24, role: 'read',
  },
];

/** Slugs that can't be used for workspaces because they collide with the tenant-scoped route literals (`/:tenant/<slug>/...`). */
export const RESERVED_WORKSPACE_SLUGS = new Set<string>([
  'inbox', 'my-issues', 'all-issues', 'projects', 'workflows',
  'teams', 'settings', 'u', 'workspaces', 'login',
]);

// ---------------------------------------------------------------------------
// Tenant members + workspace access
// ---------------------------------------------------------------------------
//
// Phase 3 reshape: users live at the tenant level. Workspace access is a
// separate, explicit grant list (`WORKSPACE_ACCESS`) — *plus* implicit
// access via project membership. The effective workspace member list is
// derived (see `workspaceMembersDerived`), not stored.

export interface TenantMember {
  email: string;
  name: string;
  tenantRole: TenantRole;
  lastSeen: string;
  status: 'active' | 'invited' | 'deactivated';
}

/** Tenant-keyed roster. Single source of truth for who exists in a tenant. */
export const TENANT_MEMBERS: Record<string, TenantMember[]> = {
  'dreamstreet': [
    { email: 'admin@dreamstreet.io', name: 'Dream Admin', tenantRole: 'admin', lastSeen: 'just now', status: 'active' },
  ],
  'acme-corp': [
    { email: 'jordan@acme.com', name: 'Jordan Lee',  tenantRole: 'admin', lastSeen: 'just now',    status: 'active' },
    { email: 'maya@acme.com',   name: 'Maya Chen',   tenantRole: 'write', lastSeen: '12 min ago',  status: 'active' },
    { email: 'sam@acme.com',    name: 'Sam Park',    tenantRole: 'write', lastSeen: '3h ago',      status: 'active' },
    { email: 'priya@acme.com',  name: 'Priya Rao',   tenantRole: 'write', lastSeen: 'yesterday',   status: 'active' },
    { email: 'riley@acme.com',  name: 'Riley Singh', tenantRole: 'write', lastSeen: 'pending',     status: 'invited' },
    { email: 'avery@acme.com',  name: 'Avery Kim',   tenantRole: 'read',  lastSeen: '4 weeks ago', status: 'deactivated' },
  ],
};

export const tenantMemberByEmail = (tenant: string, email: string): TenantMember | undefined =>
  TENANT_MEMBERS[tenant]?.find((m) => m.email === email);

export interface WorkspaceMemberAccess {
  email: string;
  workspaceRole: WorkspaceRole;
}

/**
 * tenant -> workspace -> explicit access list. Tenant admins are NOT listed
 * here (they inherit admin everywhere). Users in this list have explicit
 * grants regardless of their tenant role.
 */
export const WORKSPACE_ACCESS: Record<string, Record<string, WorkspaceMemberAccess[]>> = {
  'acme-corp': {
    acme: [
      { email: 'maya@acme.com',  workspaceRole: 'write' },
      { email: 'sam@acme.com',   workspaceRole: 'write' },
      { email: 'priya@acme.com', workspaceRole: 'write' },
    ],
    nimbus: [
      // Tenant admin (jordan) inherits; this is an explicit example for variety.
      { email: 'priya@acme.com', workspaceRole: 'admin' },
    ],
    polar: [],
  },
};

/**
 * How a member ended up with workspace access. Drives the provenance line in
 * the Settings → Members table.
 *   - `inherited`: tenant admin — admin in every workspace.
 *   - `explicit`: direct WORKSPACE_ACCESS grant.
 *   - `project`: implicit via project team / project user grant. Always
 *      resolves to `read`.
 */
export type WorkspaceMemberProvenance =
  | { kind: 'inherited' }
  | { kind: 'explicit' }
  | { kind: 'project'; projectSlugs: string[] };

/** Derived row shape for the workspace-level Members view. */
export interface WorkspaceMemberView {
  email: string;
  name: string;
  effectiveRole: WorkspaceRole;
  provenance: WorkspaceMemberProvenance;
  lastSeen: string;
  status: 'active' | 'invited' | 'deactivated';
}

export interface Team {
  /** Used in URLs and sidebar items (lowercase). */
  slug: string;
  name: string;
  description: string;
  /** Background color for the team chip. Foreground is white. */
  color: string;
  memberEmails: string[];
}

export const TEAMS: Team[] = [
  {
    slug: 'backend', name: 'Backend',
    description: 'API, database, infrastructure. Owns the workflow engine + storage layers.',
    color: '#0891b2',
    memberEmails: ['jordan@acme.com', 'maya@acme.com', 'sam@acme.com'],
  },
  {
    slug: 'frontend', name: 'Frontend',
    description: 'Web app, design system, and a11y. Owns the issue / board / workflow UIs.',
    color: '#9333ea',
    memberEmails: ['jordan@acme.com', 'maya@acme.com', 'priya@acme.com', 'riley@acme.com'],
  },
  {
    slug: 'design', name: 'Design',
    description: 'Product design, IA, and visual / interaction patterns.',
    color: '#ea580c',
    memberEmails: ['jordan@acme.com', 'avery@acme.com'],
  },
];

export const teamBySlug = (slug: string) => TEAMS.find((t) => t.slug === slug);

/** Effective members of a project (deduped union of team members + explicit users). */
export function projectEffectiveMembers(project: Project, tenant: string): TenantMember[] {
  const emails = new Set<string>(project.userEmails);
  for (const slug of project.teamSlugs) {
    const team = teamBySlug(slug);
    if (team) team.memberEmails.forEach((e) => emails.add(e));
  }
  return Array.from(emails)
    .map((e) => tenantMemberByEmail(tenant, e))
    .filter((m): m is TenantMember => !!m && m.status === 'active');
}

/**
 * Resolve a user's effective role in a workspace + how they got it.
 * Returns null if the user has no access at all.
 *
 * Resolution order:
 *   1. Tenant admin → ('admin', 'inherited')
 *   2. Explicit WORKSPACE_ACCESS entry → (that role, 'explicit')
 *   3. Implicit via project membership (team or explicit user grant on any
 *      project under this workspace) → ('read', 'project' with projects)
 *   4. null
 *
 * The caller passes the workspace's projects (from `useProjects()`) so this
 * function stays a pure read over fixtures + the user-mutable project list.
 */
export function effectiveWorkspaceRole(
  tenant: string,
  workspace: string,
  email: string,
  projects: Project[],
): { role: WorkspaceRole; provenance: WorkspaceMemberProvenance } | null {
  const tm = tenantMemberByEmail(tenant, email);
  if (!tm) return null;
  if (tm.tenantRole === 'admin') {
    return { role: 'admin', provenance: { kind: 'inherited' } };
  }

  const explicit = WORKSPACE_ACCESS[tenant]?.[workspace]?.find((a) => a.email === email);
  if (explicit) {
    return { role: explicit.workspaceRole, provenance: { kind: 'explicit' } };
  }

  const viaProjects = projects
    .filter((p) => {
      if (p.userEmails.includes(email)) return true;
      return p.teamSlugs.some((slug) => teamBySlug(slug)?.memberEmails.includes(email));
    })
    .map((p) => p.slug);
  if (viaProjects.length > 0) {
    return { role: 'read', provenance: { kind: 'project', projectSlugs: viaProjects } };
  }

  return null;
}

/**
 * The full set of members with any access to a workspace, with provenance.
 * Order: inherited (tenant admins) first, then explicit grants, then implicit
 * project-only members. Within each group, ordered by tenant member insertion
 * order.
 */
export function workspaceMembersDerived(
  tenant: string,
  workspace: string,
  projects: Project[],
): WorkspaceMemberView[] {
  const tenantMembers = TENANT_MEMBERS[tenant] ?? [];
  const out: WorkspaceMemberView[] = [];
  for (const tm of tenantMembers) {
    // Deactivated tenant members lose access everywhere — keep them out of
    // the workspace roster. They still show up on the tenant Members tab.
    if (tm.status === 'deactivated') continue;
    const eff = effectiveWorkspaceRole(tenant, workspace, tm.email, projects);
    if (!eff) continue;
    out.push({
      email: tm.email,
      name: tm.name,
      effectiveRole: eff.role,
      provenance: eff.provenance,
      lastSeen: tm.lastSeen,
      status: tm.status,
    });
  }
  const order: Record<WorkspaceMemberProvenance['kind'], number> = {
    inherited: 0, explicit: 1, project: 2,
  };
  out.sort((a, b) => order[a.provenance.kind] - order[b.provenance.kind]);
  return out;
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------
//
// Workflows are first-class. Each (project, issue_type) pair selects exactly
// one workflow id. Two projects can share a workflow or each pick a different
// one. The fixture below intentionally gives Epic two flavors so the editor
// shows different graphs for Comet/Orbit vs Atlas.

export interface WorkflowNode {
  id: string;
  statusId: string;
  x: number;
  y: number;
  count: number;
  rules: number;
  initial?: boolean;
  terminal?: boolean;
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

export interface WorkflowDef {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export const WORKFLOWS: Record<string, WorkflowDef> = {
  default: {
    id: 'default',
    name: 'Default',
    description: 'The standard six-state flow with reopen and request-changes back-edges. Used by Task, Bug, and Story by default.',
    nodes: [
      { id: 'n1', statusId: 'backlog',     x:  40, y: 240, count: 47, rules: 0, initial: true },
      { id: 'n2', statusId: 'todo',        x: 220, y: 240, count: 23, rules: 1 },
      { id: 'n3', statusId: 'in-progress', x: 400, y: 160, count: 12, rules: 2 },
      { id: 'n4', statusId: 'in-review',   x: 580, y: 160, count:  6, rules: 3 },
      { id: 'n5', statusId: 'done',        x: 760, y: 240, count: 312, rules: 1, terminal: true },
      { id: 'n6', statusId: 'canceled',    x: 400, y: 380, count: 89, rules: 1, terminal: true },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' },
      { id: 'e2', from: 'n2', to: 'n3' },
      { id: 'e3', from: 'n3', to: 'n4', label: 'PR opened' },
      { id: 'e4', from: 'n4', to: 'n5', label: 'approve', dashed: true },
      { id: 'e5', from: 'n4', to: 'n3', label: 'request changes' },
      { id: 'e6', from: 'n3', to: 'n2' },
      { id: 'e7', from: 'n2', to: 'n6' },
      { id: 'e8', from: 'n3', to: 'n6' },
      { id: 'e9', from: 'n5', to: 'n2', label: 'reopen', dashed: true },
    ],
  },
  'epic-coarse': {
    id: 'epic-coarse',
    name: 'Coarse',
    description: 'Three-state flow for tracking epics loosely. No review phase; back-edge for reopen.',
    nodes: [
      { id: 'n1', statusId: 'todo',        x: 100, y: 220, count:  4, rules: 0, initial: true },
      { id: 'n2', statusId: 'in-progress', x: 360, y: 220, count:  2, rules: 0 },
      { id: 'n3', statusId: 'done',        x: 620, y: 220, count: 11, rules: 0, terminal: true },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2', label: 'start' },
      { id: 'e2', from: 'n2', to: 'n3', label: 'finish' },
      { id: 'e3', from: 'n3', to: 'n2', label: 'reopen', dashed: true },
    ],
  },
  'epic-detailed': {
    id: 'epic-detailed',
    name: 'Detailed (with spec & review)',
    description: 'Five-state flow for epics that go through a spec phase and require review before close.',
    nodes: [
      { id: 'n1', statusId: 'backlog',     x:  40, y: 240, count:  6, rules: 0, initial: true },
      { id: 'n2', statusId: 'todo',        x: 220, y: 240, count:  3, rules: 1 },
      { id: 'n3', statusId: 'in-progress', x: 400, y: 240, count:  2, rules: 1 },
      { id: 'n4', statusId: 'in-review',   x: 580, y: 240, count:  1, rules: 2 },
      { id: 'n5', statusId: 'done',        x: 760, y: 240, count: 14, rules: 1, terminal: true },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2', label: 'spec' },
      { id: 'e2', from: 'n2', to: 'n3', label: 'start' },
      { id: 'e3', from: 'n3', to: 'n4', label: 'submit for review' },
      { id: 'e4', from: 'n4', to: 'n3', label: 'request changes' },
      { id: 'e5', from: 'n4', to: 'n5', label: 'approve', dashed: true },
      { id: 'e6', from: 'n5', to: 'n3', label: 'reopen', dashed: true },
    ],
  },
};

/**
 * Default workflow assignment for a brand-new project. Tasks/Bugs/Stories
 * use the standard six-state flow; Epics use the loose three-state flow.
 */
export const DEFAULT_PROJECT_WORKFLOWS: Record<IssueTypeLetter, string> = {
  T: 'default', B: 'default', S: 'default', E: 'epic-coarse',
};
