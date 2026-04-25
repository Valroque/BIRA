// Demo data used by the prototype. No real persistence.

export type ProjectSlug = 'comet' | 'orbit' | 'atlas';

export interface ProjectInfo {
  slug: ProjectSlug;
  name: string;
  /** Used as the prefix in issue IDs (CMT, ORB, ATL). */
  key: string;
  /** Letter shown inside the small project chip. */
  letter: string;
  /** Color of the chip background — picked from the accent palette. */
  color: string;
  bg: string;
}

export const PROJECT_INFO: Record<ProjectSlug, ProjectInfo> = {
  comet: { slug: 'comet', name: 'Comet', key: 'CMT', letter: 'C', color: '#4f46e5', bg: '#e0e7ff' },
  orbit: { slug: 'orbit', name: 'Orbit', key: 'ORB', letter: 'O', color: '#0891b2', bg: '#cffafe' },
  atlas: { slug: 'atlas', name: 'Atlas', key: 'ATL', letter: 'A', color: '#16a34a', bg: '#dcfce7' },
};

export interface Issue {
  id: string;
  type: 'T' | 'B' | 'S' | 'E';
  title: string;
  status: 'backlog' | 'todo' | 'in-progress' | 'in-review' | 'done' | 'canceled';
  priority: 'urgent' | 'high' | 'med' | 'low' | 'none';
  assignee: string;
  labels: string[];
  updated: string;
  estimate?: number;
  /** Slug of the project that owns this issue. Drives the URL of issue detail. */
  project: ProjectSlug;
}

export const ISSUES: Issue[] = [
  // --- Comet ---
  { id: 'CMT-241', project: 'comet', type: 'B', title: 'Reorder of states corrupts saved view state when filter is active', status: 'in-review', priority: 'urgent', assignee: 'Maya Chen', labels: ['regression', 'workflow'], updated: '2h ago', estimate: 3 },
  { id: 'CMT-238', project: 'comet', type: 'S', title: 'Allow workspace admins to fork the default workflow per project', status: 'in-progress', priority: 'high', assignee: 'Jordan Lee', labels: ['workflow', 'admin'], updated: '4h ago', estimate: 8 },
  { id: 'CMT-237', project: 'comet', type: 'T', title: 'Document the 5 transition rule types in /help', status: 'todo', priority: 'med', assignee: 'Priya Rao', labels: ['docs'], updated: 'yesterday', estimate: 2 },
  { id: 'CMT-235', project: 'comet', type: 'B', title: 'Self-loop edges render outside node hit area at zoom < 60%', status: 'todo', priority: 'low', assignee: 'Maya Chen', labels: ['workflow'], updated: '2d ago', estimate: 1 },
  { id: 'CMT-234', project: 'comet', type: 'T', title: 'Add bulk-edit support for status and assignee on board view', status: 'in-progress', priority: 'high', assignee: 'Sam Park', labels: ['board'], updated: '1d ago', estimate: 5 },
  { id: 'CMT-232', project: 'comet', type: 'E', title: 'Custom field schema per project', status: 'backlog', priority: 'high', assignee: 'Jordan Lee', labels: ['fields', 'q3'], updated: '3d ago', estimate: 21 },
  { id: 'CMT-230', project: 'comet', type: 'S', title: 'Auto-archive Done issues after 30 days', status: 'in-review', priority: 'med', assignee: 'Sam Park', labels: ['retention'], updated: '5h ago', estimate: 3 },
  { id: 'CMT-229', project: 'comet', type: 'B', title: 'Cycle detection misses A→B→A back-edges in graph linter', status: 'in-progress', priority: 'urgent', assignee: 'Maya Chen', labels: ['workflow'], updated: '8h ago', estimate: 5 },
  { id: 'CMT-227', project: 'comet', type: 'T', title: 'Slug validation on workspace creation', status: 'done', priority: 'med', assignee: 'Priya Rao', labels: ['onboarding'], updated: '1d ago', estimate: 2 },
  { id: 'CMT-225', project: 'comet', type: 'B', title: 'Empty state on inbox triggers layout flash on first load', status: 'todo', priority: 'low', assignee: 'Sam Park', labels: ['frontend'], updated: '4d ago', estimate: 2 },
  { id: 'CMT-223', project: 'comet', type: 'S', title: 'Slack-style /commands in comments', status: 'backlog', priority: 'med', assignee: 'Jordan Lee', labels: ['comments'], updated: '1w ago', estimate: 8 },
  { id: 'CMT-220', project: 'comet', type: 'T', title: 'Export workflow as YAML', status: 'backlog', priority: 'low', assignee: 'Priya Rao', labels: ['workflow'], updated: '1w ago', estimate: 3 },

  // --- Orbit ---
  { id: 'ORB-58', project: 'orbit', type: 'S', title: 'Render top-of-funnel chart with project-level filter', status: 'in-progress', priority: 'high', assignee: 'Jordan Lee', labels: ['analytics'], updated: '1h ago', estimate: 5 },
  { id: 'ORB-55', project: 'orbit', type: 'B', title: 'Date-range picker drops timezone offset on apply', status: 'in-review', priority: 'urgent', assignee: 'Riley Singh', labels: ['regression', 'analytics'], updated: '3h ago', estimate: 2 },
  { id: 'ORB-52', project: 'orbit', type: 'T', title: 'Add CSV export for cohort table', status: 'todo', priority: 'med', assignee: 'Jordan Lee', labels: ['exports'], updated: '6h ago', estimate: 3 },
  { id: 'ORB-49', project: 'orbit', type: 'B', title: 'Loading spinner persists after error response', status: 'todo', priority: 'low', assignee: 'Avery Kim', labels: ['frontend'], updated: '2d ago', estimate: 1 },
  { id: 'ORB-44', project: 'orbit', type: 'S', title: 'Per-user retention view on dashboard', status: 'backlog', priority: 'med', assignee: 'Riley Singh', labels: ['analytics', 'retention'], updated: '4d ago', estimate: 8 },
  { id: 'ORB-40', project: 'orbit', type: 'E', title: 'Cohort analysis revamp', status: 'backlog', priority: 'high', assignee: 'Jordan Lee', labels: ['q3', 'analytics'], updated: '1w ago', estimate: 21 },
  { id: 'ORB-32', project: 'orbit', type: 'T', title: 'Tighten type-safety on event schema', status: 'done', priority: 'low', assignee: 'Sam Park', labels: ['refactor'], updated: '3d ago', estimate: 2 },

  // --- Atlas ---
  { id: 'ATL-118', project: 'atlas', type: 'B', title: 'Map tiles fail to load when offline cache is full', status: 'in-progress', priority: 'urgent', assignee: 'Maya Chen', labels: ['offline', 'map'], updated: '45m ago', estimate: 5 },
  { id: 'ATL-115', project: 'atlas', type: 'S', title: 'Pinch-zoom acceleration curve on mobile', status: 'in-review', priority: 'med', assignee: 'Jordan Lee', labels: ['mobile', 'map'], updated: '2h ago', estimate: 3 },
  { id: 'ATL-112', project: 'atlas', type: 'T', title: 'Migrate icon set to Lucide v2', status: 'todo', priority: 'low', assignee: 'Priya Rao', labels: ['frontend'], updated: '1d ago', estimate: 2 },
  { id: 'ATL-110', project: 'atlas', type: 'S', title: 'Cluster overlay markers above zoom 14', status: 'todo', priority: 'high', assignee: 'Jordan Lee', labels: ['map'], updated: '2d ago', estimate: 5 },
  { id: 'ATL-104', project: 'atlas', type: 'B', title: 'GPX import drops elevation column', status: 'backlog', priority: 'med', assignee: 'Avery Kim', labels: ['imports'], updated: '5d ago', estimate: 3 },
  { id: 'ATL-100', project: 'atlas', type: 'E', title: 'Real-time location sharing for teams', status: 'backlog', priority: 'high', assignee: 'Maya Chen', labels: ['q4', 'collaboration'], updated: '2w ago', estimate: 34 },
  { id: 'ATL-98',  project: 'atlas', type: 'T', title: 'Tile server health check endpoint', status: 'done', priority: 'med', assignee: 'Sam Park', labels: ['ops'], updated: '6d ago', estimate: 2 },
];

/** Current user (mocked for the prototype). */
export const CURRENT_USER = {
  name: 'Jordan Lee',
  email: 'jordan@acme.com',
  role: 'admin' as const,
};

// ---------------------------------------------------------------------------
// Workspace members + teams + project access
// ---------------------------------------------------------------------------

export interface Member {
  email: string;
  name: string;
  role: 'admin' | 'member';
  lastSeen: string;
  status: 'active' | 'invited' | 'deactivated';
}

/**
 * The full workspace member roster. The Settings → Members table reads from
 * here, and project-level access lists resolve emails against this map.
 */
export const MEMBERS: Member[] = [
  { email: 'jordan@acme.com', name: 'Jordan Lee',  role: 'admin',  lastSeen: 'just now',    status: 'active' },
  { email: 'maya@acme.com',   name: 'Maya Chen',   role: 'member', lastSeen: '12 min ago',  status: 'active' },
  { email: 'sam@acme.com',    name: 'Sam Park',    role: 'member', lastSeen: '3h ago',      status: 'active' },
  { email: 'priya@acme.com',  name: 'Priya Rao',   role: 'member', lastSeen: 'yesterday',   status: 'active' },
  { email: 'riley@acme.com',  name: 'Riley Singh', role: 'member', lastSeen: 'pending',     status: 'invited' },
  { email: 'avery@acme.com',  name: 'Avery Kim',   role: 'member', lastSeen: '4 weeks ago', status: 'deactivated' },
];

export const memberByEmail = (email: string) => MEMBERS.find((m) => m.email === email);

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

/** Per-project access — a mix of explicit individuals (by email) + whole teams. */
export interface ProjectAccess {
  /** Slugs of teams that have access to the project. */
  teamSlugs: string[];
  /** Emails of individuals with explicit access (in addition to team members). */
  userEmails: string[];
}

export const PROJECT_MEMBERS: Record<ProjectSlug, ProjectAccess> = {
  comet: { teamSlugs: ['backend', 'frontend'], userEmails: ['priya@acme.com'] },
  orbit: { teamSlugs: ['frontend'],            userEmails: ['sam@acme.com'] },
  atlas: { teamSlugs: ['backend', 'design'],   userEmails: ['priya@acme.com'] },
};

/** Effective members of a project (deduped union of team members + explicit users). */
export function projectEffectiveMembers(project: ProjectSlug): Member[] {
  const access = PROJECT_MEMBERS[project];
  const emails = new Set<string>(access.userEmails);
  for (const slug of access.teamSlugs) {
    const team = teamBySlug(slug);
    if (team) team.memberEmails.forEach((e) => emails.add(e));
  }
  return Array.from(emails)
    .map((e) => memberByEmail(e))
    .filter((m): m is Member => !!m && m.status === 'active');
}

/** Reverse-lookup: which projects has this team been added to. */
export function projectsForTeam(slug: string): ProjectSlug[] {
  const out: ProjectSlug[] = [];
  (Object.keys(PROJECT_MEMBERS) as ProjectSlug[]).forEach((p) => {
    if (PROJECT_MEMBERS[p].teamSlugs.includes(slug)) out.push(p);
  });
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

export type IssueTypeLetter = 'T' | 'B' | 'S' | 'E';

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

/** Maps each (project, issue_type) pair to a workflow id. */
export const PROJECT_WORKFLOWS: Record<ProjectSlug, Record<IssueTypeLetter, string>> = {
  comet: { T: 'default', B: 'default', S: 'default', E: 'epic-coarse' },
  orbit: { T: 'default', B: 'default', S: 'default', E: 'epic-coarse' },
  atlas: { T: 'default', B: 'default', S: 'default', E: 'epic-detailed' },
};

export const ISSUE_TYPE_NAMES: Record<IssueTypeLetter, string> = {
  T: 'Task', B: 'Bug', S: 'Story', E: 'Epic',
};

/** Reverse-lookup: which (project, issue_type) pairs use this workflow id. */
export function projectsUsingWorkflow(workflowId: string) {
  const pairs: { project: ProjectSlug; type: IssueTypeLetter }[] = [];
  (Object.keys(PROJECT_WORKFLOWS) as ProjectSlug[]).forEach((p) => {
    (Object.keys(PROJECT_WORKFLOWS[p]) as IssueTypeLetter[]).forEach((t) => {
      if (PROJECT_WORKFLOWS[p][t] === workflowId) pairs.push({ project: p, type: t });
    });
  });
  return pairs;
}
