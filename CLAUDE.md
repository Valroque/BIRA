# BIRA — Project context for Claude

This file is the load-bearing brief for any Claude session working on BIRA.
Read the TL;DR. Skim the rest before making changes; the rest of the
codebase will make sense faster.

For the **product narrative + entity model in plain language** (intended
for humans reading top-down) see [`docs/product.md`](docs/product.md).
For the **decision log** explaining *why* the rules below are what they
are, see [`docs/decisions.md`](docs/decisions.md). The hard rules
themselves live at [`.claude/rules/v1-constraints.md`](.claude/rules/v1-constraints.md).

> **Backend phase (started 2026-05-04, ongoing):** Backend code lives in
> `server/` (Node + TS + Express + Knex + Postgres); FE moved to `web/`;
> root is an npm workspace. Tenants / workspaces / projects / users /
> auth, plus issues + hierarchy + schedules + links + workflows +
> comments + files + mentionables, are all wired in `server/` with test
> coverage on the early surfaces. The FE has **not** been rewired to
> call the API yet; that's a separate phase once endpoints stabilise.
> See `memory/project_backend_phase.md` and `server/README.md` for the
> live endpoint list.

---

## TL;DR — if you only read this

1. **Backend phase is active** (started 2026-05-04). FE under `web/`
   is still fixture-driven; backend under `server/` covers tenants,
   workspaces, projects, users, auth, issues + hierarchy + schedules +
   links, workflows + transition guard, comments, files,
   mentionables. Don't add API calls from the FE until told to —
   endpoints are still moving and FE wiring is a later phase.
2. **Stack**: Vite + React 18 + TypeScript + `react-router-dom` v7. Plain CSS
   with design tokens in `src/index.css`. No Tailwind, no UI library,
   self-hosted Geist fonts.
3. **Mental model**: workspace (tenant) → project → issue. URLs are path-slug
   only: `/:workspace/...`, `/:workspace/:project/...`. No subdomains.
4. **Workflows** are first-class directed graphs (cycles allowed — reopen,
   request-changes are back-edges). Each `(project, issue_type)` selects one
   workflow. Multiple workflows can exist for the same issue type.
5. **Transition rules** are a closed enum of five: `role`, `assignee_only`,
   `reporter_only`, `required_fields`, `not_self`. No scripting language.
   Don't add `approver`, `external_check`, or `custom_script` — they were
   designer drift and were removed.
6. **Issue hierarchy** is a shallow tree: Epic → Story → Task/Bug, plus
   Epic → Task/Bug as a shortcut. Tasks and Bugs are always leaves. At
   most one parent per issue. Stored on **both ends** (`parent` on the
   child, `children[]` on the parent). **Epics are top-level — they
   cannot have a parent.** **Stories require an Epic parent** — the
   inspector forbids clearing it and the picker only offers Epics.
   Schedules (start/end dates) live on Tasks/Bugs only; Stories and
   Epics derive their Gantt span from descendant leaves. Issue link
   types in v1: `relates` (symmetric, untyped, every issue, stored on
   both ends as `relatedTo[]`) and `depends on`
   (directed, **Task-only**, A can't start until B ends, stored on
   both ends as `dependsOn[]` / `dependedOnBy[]`, must stay a DAG —
   cycles are rejected at edit time via `dependsOnWouldCycle`). See
   `docs/product.md`.
7. **Out of scope for v1**: sprints, backlog grooming, sub-tasks below
   Task/Bug, link types beyond `relates` and `depends on`, custom fields, JQL, SSO,
   integrations, notifications, public REST API, granular roles. Full
   list in `.claude/rules/v1-constraints.md`.
8. **State**: in-memory fixtures only (`src/fixtures.ts`), plus a few
   `localStorage` keys: `bira:list-layout` (column UI prefs, tenant-unaware),
   `bira:issues-view` (List vs Gantt toggle on the workspace + project
   issue lists, tenant-unaware), `bira:issues-state:<tenant>:<workspace>:<persistKey>`
   (per-page toolbar state — `groupByList` + `groupByGantt` (independent
   per view), level, granularity, sort stack, unlocked filters — for My
   Issues / All Issues; locked filters always come from `initialFilters`), `bira:issue-inspector-width` (UI prefs,
   tenant-unaware), `bira:tenants`
   (user-created tenants — merged with `TENANTS` by `TenantsProvider`),
   `bira:workspaces:<tenant>` (per-tenant workspace list — `WorkspacesProvider`
   is mounted per tenant inside `TenantLayout`),
   `bira:workspace-archived:<tenant>` (`Record<slug, boolean>` overlay so seed
   workspaces can be archived without shadowing the whole row — merged into
   `Workspace.archived` on read; mirrors backend `workspaces.status`),
   `bira:projects:<tenant>:<workspace>`
   (per-workspace project list — only the demo `acme-corp/acme` workspace
   gets `SEED_PROJECTS` seeded), `bira:board-columns:<tenant>:<workspace>:<project>`
   (per-project board config), and `bira:issue-overrides:v2:<tenant>:<workspace>`
   (per-workspace `Partial<Issue>` patches — slice 5 (2026-05-05) flipped
   `IssuesProvider` to fetch live from the BE on mount and treat this
   localStorage layer as the **planning-gantt seed** per the
   planning-vs-reality-gantt design call: writes here are ephemeral,
   client-only, and never hit the API. Reality-gantt writes (slice 6)
   will route through PATCH while inspector / planning-gantt edits keep
   using this path. The `v2` prefix was bumped on 2026-05-05 when
   `Issue.id`/`project`/`assignee` were renamed to
   `key`/`projectId` (uuid)/`assigneeUserId` (uuid|null) — pre-bump blobs
   are silently ignored).
   Tenant + workspace + project come from the URL via
   `useTenantContext()` in `shell.tsx` — never hardcode `/acme-corp/acme/comet/`.
   Read tenant data via `useTenants()` from `src/state/tenants.tsx`, workspace data via
   `useWorkspaces()` from `src/state/workspaces.tsx`, project data via `useProjects()`
   from `src/state/projects.tsx`, users via `useUsers()` from
   `src/state/users.tsx`, and issues via `useIssues()` from
   `src/state/issues.tsx` (slice 5: API-backed via
   `GET /api/tenants/:t/workspaces/:w/issues`; the
   `bira:issue-overrides:v2:<tenant>:<workspace>` blob layered on top is
   the planning-gantt seed and is never written back to the API) — never
   from stale `WORKSPACES`/`TENANTS`-direct lookups or `ISSUES`-direct
   reads (the fixture is deprecated as of slice 5; only design-canvas
   reference screens still touch it).
   **UUIDs never render** — `Issue.projectId` resolves via `useProjects().getProjectById(id)`,
   `Issue.assigneeUserId` via `useUsers().getUser(id)`. Missing → "Unknown user" /
   "Unknown project", never the raw uuid.
9. **Reuse, don't reinvent**: every layout primitive lives in
   `src/components/` (especially `shell.tsx`). Adding a parallel `<button>`
   styled like an existing `Chip` is a defect, not a shortcut.
10. **Design tokens only**. Use `var(--token)` from `src/index.css`. No raw
    hex codes outside the `/design-canvas` reference page.
11. **Build gate**: `npm run build` (or `npx tsc --noEmit` for a faster
    type-only pass) on `web/`. The backend has its own test suite
    (`cd server && npm test`, Vitest + supertest against a real
    Postgres `bira_test` database) — extend it whenever you ship an
    API change. The FE still has no automated tests.

When work feels like more than a 3-edit task, invoke `/tech-lead` first to
plan and decompose. The agent personas in `.claude/commands/` know the
project conventions and reference the same rules file.

---

## 1. What BIRA is

BIRA is a **self-hostable, open-source JIRA alternative** for project and
issue tracking. The intended audience is small-to-mid teams that want to run
their own tracker on their own infra rather than paying for a vendor. Tone is
closer to Linear / GitHub Issues than to Atlassian's current JIRA — dense,
keyboard-friendly, opinionated.

Think: workspaces (tenants) → projects → issues, with a graph-based workflow
engine and rule-gated transitions.

---

## 2. Current status

**Frontend** is feature-complete enough that we've started building the
backend. FE lives under `web/`; data is still in-memory fixtures
(`web/src/fixtures.ts`) plus a few `localStorage` keys. The backend
endpoints exist for issues / workflows / comments / files but the FE
hasn't been switched off the fixtures yet — that's a dedicated phase
once endpoints stop moving.

**Backend** lives under `server/` and is being built incrementally —
the layering is ported from the ABHA project (Node + Express + Knex +
Postgres), translated to TypeScript. Live surfaces: tenants /
workspaces / projects / users / auth, issues + hierarchy + schedules
+ links, workflows + transition guard, comments, files, mentionables.
See `server/README.md` for the endpoint catalogue + layout
conventions and `memory/project_backend_phase.md` for current state.

**FE↔BE wiring is intentionally deferred.** Endpoints are still
moving; do not point the FE at the API until told to.

---

## 3. Stack

- **Frontend** (`web/`): Vite + React 18 + TypeScript + `react-router-dom` v7.
- **Backend** (`server/`): Node 20 + TypeScript (ESM) + Express + Knex
  + Postgres 16. JWT auth (access + refresh). Layering: routes →
  usecases → services → entities; middleware for auth + tenant scope;
  errors via `EntityError` / `ServiceError` / `AppError`.
- **Repo shape**: npm workspaces. Root coordinates `web/` + `server/`.
- **Routing (FE)**: `react-router-dom` v7. Router definitions live in `web/src/App.tsx`.
- **Styling**: plain CSS with design tokens in `web/src/index.css`. Inline styles
  on components for layout. No Tailwind, no CSS-in-JS library, no shadcn.
- **Fonts**: Geist Sans + Geist Mono via `@fontsource/geist-sans` and
  `@fontsource/geist-mono` (self-hosted, no Google Fonts CDN — the app stays
  offline-friendly to match the self-host ethos).
- **Icons**: inline SVG strokes in `src/components/icons.tsx`. Lucide-style.
  No external icon library.

**Backend (planned, not yet built)**: Node.js + TypeScript + Postgres. Node
processes run on the host (no Docker for the app itself); Postgres runs as a
separate dependency reachable via `DATABASE_URL` (a local Docker container in
dev, AWS RDS or similar in cloud). See `project_stack` memory for the exact
deployment shape.

---

## 4. Repo layout

```
BIRA/
├── CLAUDE.md                 ← this file
├── .claude/
│   ├── commands/             ← /tech-lead, /product-lead, /be-dev, /fe-dev
│   ├── rules/v1-constraints.md
│   └── settings.local.json   ← gitignored
├── index.html
├── vite.config.ts
├── package.json
├── public/
└── src/
    ├── App.tsx               ← Router definitions
    ├── main.tsx              ← Bootstrap + font imports
    ├── index.css             ← Design tokens + element resets
    ├── fixtures.ts           ← All demo data + per-domain helpers
    ├── components/           ← Cross-cutting building blocks
    │   ├── shell.tsx         ← Sidebar, TopBar, Tabs, atoms
    │   ├── app-shell.tsx     ← Sidebar + content layout wrapper
    │   ├── icons.tsx         ← Inline SVG icon set
    │   ├── command-palette.tsx
    │   ├── topbar-menus.tsx
    │   ├── issue-row.tsx     ← ListRow + column-layout system
    │   ├── issue-filters.tsx ← Filter / sort logic + UI
    │   ├── states.tsx        ← EmptyState, ErrorState, SkeletonRow
    │   └── issue-row.tsx
    └── screens/              ← Page-level components, one per route
        ├── login.tsx
        ├── setup.tsx
        ├── accept-invite.tsx
        ├── inbox.tsx
        ├── projects.tsx
        ├── workflows.tsx
        ├── teams.tsx
        ├── workspace-issues.tsx ← My Issues + All Issues
        ├── project-overview.tsx
        ├── board.tsx         ← Kanban + bulk-action bar
        ├── list.tsx          ← Project-scoped issue list
        ├── workflow.tsx      ← Graph editor + variants (rule editor lives in EdgeInspector)
        ├── issue-detail.tsx
        ├── create-issue.tsx
        ├── project-members.tsx
        ├── project-settings.tsx
        ├── settings.tsx      ← Workspace-level settings + tabs
        └── design-canvas.tsx ← Visual reference, all screens at once
```

---

## 5. v1 scope decisions

These are the load-bearing product decisions. They override generic best
practices. Don't propose changes to these without explicit user sign-off.

- **Multi-tenant**: workspaces are the tenant boundary. A user can belong to
  multiple workspaces — they pick one at `/workspaces` after sign-in. Each
  workspace owns its own projects, teams, and members. URL shape:
  `/:workspace/...` (path slug, not subdomain).
- **Kanban only**: no sprints, no backlog grooming, no burndown, no story
  points UI. Status grouping on a board is the only flow. *Several places had
  drift to sprint UX during the design phase — they got cleaned up; don't
  reintroduce.*
- **Workflows are first-class entities**, not enum lists. Each `(project,
  issue_type)` pair selects one workflow. Multiple workflows can exist for
  the same issue type — projects can share or each pick its own. (The earlier
  v1 decision of "one workflow per `(workspace, issue_type)`, no per-project
  forks" was walked back when the user asked for two distinct Epic workflows
  used by different projects.)
- **Workflows are directed graphs, NOT DAGs.** Cycles are allowed and needed
  — reopen, request-changes, send-back-for-revision are all back-edges. The
  layout still pays off in the *common case* (forward progression) but data
  model and editor must support cycles.
- **Transitions carry rules** — guards that decide whether a user is allowed
  to move an issue across a transition. **Five rule types** (closed enum, no
  scripting):
  1. `role` — acting user has role X (admin / write / read)
  2. `assignee_only` — acting user is the issue's assignee
  3. `reporter_only` — acting user is the issue's reporter
  4. `required_fields` — listed fields must be set on the issue
  5. `not_self` — acting user is NOT the reporter
- **Issue types**: Task / Bug / Story / Epic. Workspace-configurable later;
  hardcoded for v1.
- **Issue hierarchy** is a shallow tree:
  - Epic → Story → Task / Bug
  - Epic → Task / Bug (Tasks/Bugs may sit directly under an Epic)
  - Story → Task / Bug only (no nested stories, no epic-of-epic)
  - Task / Bug are always leaves
  - At most one parent per issue. Stored on **both ends** —
    `Issue.parent` on the child + `Issue.children[]` on the parent.
  - **Epics are top-level — they cannot have a parent.** The Parent
    meta is hidden for `type === 'E'`; `allowedParentTypes` is empty.
  - **Stories require an Epic parent.** The picker for a Story only
    surfaces Epics; the inspector hides the clear-parent (×) button so
    the requirement can't be circumvented. A Story rendered without a
    parent shows a "Pick an Epic" prompt instead of "Not set".
- **Schedules**: `startDate`/`endDate` live on Tasks and Bugs only.
  Stories and Epics carry no dates of their own — the Gantt derives
  their bar from the union of descendant Task/Bug dates (read-only,
  rendered in muted gray, not draggable). Inspector date editors only
  show for `type === 'T' | 'B'`. The "No schedule" badge in the Gantt
  label column is also leaf-only — Stories/Epics with no dated
  descendants render a blank slot, not a "missing field" prompt.
- **Working week is Mon-Fri**, plus **holidays** in the `HOLIDAYS`
  set are non-working too. Sat/Sun and any HOLIDAYS entry don't count
  toward effort capacity, working-day spans, or velocity math.
  Helpers in `fixtures.ts`: `WORKING_WEEKDAYS`, `WORKING_DAYS_PER_WEEK
  = 5`, `HOLIDAYS` (currently `['2026-05-01']` — Labour Day),
  `isWorkingDay(iso)`, `isWorkingDate(date)`,
  `workingDaysBetween(start, end)`, `addWorkingDays(iso, n)`. The
  Gantt timeline shades both weekends and holidays.
- **Effort estimates** are required on Tasks, optional on Bugs, and
  hidden on Stories/Epics (those roll up). Ideal velocity is
  `IDEAL_POINTS_PER_DAY = 4` (one assignee delivers ~4 points per
  **working** day) — a single constant, no per-team overrides in v1.
  Used to render "≈ N working days at 4/day" hints alongside any
  effort value.
- **Squeezed bars are allowed but flagged.** Estimate and dates are
  independent — drag a Gantt bar tighter than the ideal span and the
  bar is striped in the blocked colour, gets a red border + alert
  icon, and the inspector shows "Overworked: N pts/day (M× ideal)".
  `computeTaskLoad(estimate, start, end)` is the source of truth;
  `overload > 1.0` is the threshold.
- **Per-assignee daily load** is surfaced when the Gantt is grouped
  by assignee. Each group's timeline row highlights days where the
  combined scheduled pts/day exceeds ideal (red wash + hover with
  exact load), and the group label gets a red `⚠ N` chip with the
  overloaded day count. Catches cases where overlapping mid-sized
  Tasks add up even though each one alone looks fine. Helper:
  `dailyLoadFor(items)` in `issues-gantt.tsx`.
- **Issue links**: two types in v1.
  - **`relates`** — symmetric, untyped beyond the verb. Available on
    every issue type. Stored on both ends as `relatedTo[]`.
  - **`depends on`** — directed, **Task-only**. A depends on B means A
    can't start until B ends; A Task can depend on many Tasks. Stored
    on both ends as `dependsOn[]` (predecessors) and `dependedOnBy[]`
    (successors). Must stay a DAG — cycles are rejected at the picker
    via `dependsOnWouldCycle`. Subsumes the "blocks" link type that
    was previously deferred.
  - `duplicates` / `causes` are still deferred. No transition rule like
    "blocked by linked issue" yet — the depends-on graph drives Gantt
    semantics, not transition guards.
- **Symmetric storage rule**: parent/children, relatedTo, and depends-on
  (`dependsOn` ↔ `dependedOnBy`) are all denormalised. Touching one side
  means touching the other; there's no auto-mirroring.
- **Three roles**: `admin`, `write`, `read`. Ordered ladder
  (`read < write < admin`; write implies read, admin implies write). Roles
  can be assigned to **teams** (defaults) or **individual users** (overrides).
  Resolution: explicit-over-inherited — an explicit user grant wins over team
  grants, in either direction. Team grants combine via union (highest team
  role wins). Admin is only ever assigned explicitly to a user, never via a
  team. No granular per-feature permissions in v1.
- **Explicitly out of scope for v1** (deferred — do not add):
  Sprints / backlog / burndown · Sub-tasks below Task/Bug · Issue link
  types beyond `relates` and `depends on` · Granular roles · Notifications + @mentions +
  watchers · Custom fields · Custom per-project workflow editor UI ·
  Reports / dashboards · JQL · Integrations (Git/Slack/webhooks) ·
  SSO/SAML · Public REST API.

Drift to any of these in the design files is a bug. Search the codebase for
`"Drift fix"` comments to see prior corrections.

---

## 6. Design system

- **Tokens** live in `src/index.css` under `:root` — surfaces, borders,
  text colors, accent (indigo), per-status colors, per-type colors, priority
  colors, shadows, radii, density, type scale. Use `var(--token-name)` —
  never inline a hex value.
- **Atoms** in `src/components/shell.tsx`: `StatusDot`, `TypeChip`,
  `Priority`, `Avatar`, `IssueId`, `KBD`, `TopBar`, `Sidebar`, `Tabs`,
  `Toolbar`, `Chip`. Plus the `STATUSES` source-of-truth for status names
  and colors.
- **Layout primitive**: `<AppShell>` wraps any in-workspace screen with a
  sidebar + content area, and mounts the global `<CommandPalette>` (⌘K).
- **Breadcrumbs** are clickable `Link`s when their `to` is set. Convention:
  workspace name links to `/:workspace/projects`; project name links to
  `/:workspace/:project`; section names link to their landing route; the
  last segment is always non-clickable (current page).
- **Project tabs** come from `projectTabs(workspace, project)` in
  `shell.tsx` — single source so every project page has the same tab
  strip with consistent URLs.

---

## 7. Workspace-level table system

The My Issues / All Issues views (and any future workspace-level lists)
use a fully customizable table:

- **`ListRow`** in `src/components/issue-row.tsx` is the row component.
  It dispatches each column to `renderCell(colId, ...)`.
- **`ColumnLayout`** is `{ widths, order, visible }`, persisted in
  `localStorage` under `bira:list-layout`. Hook: `useColumnLayout()`.
- **`buildRowColumns(widths, order, visible, showProject)`** generates the
  `grid-template-columns` value used by both `ListRow` and the
  `TableHeader` so headers and cells line up exactly.
- **TableHeader** in `src/screens/workspace-issues.tsx` is sticky, has a
  select-all checkbox, and per data-column it supports:
  - **Click** → header-driven sort (toggles `not-sorted → asc → desc → off`).
    Stacks: clicking another column adds it as secondary sort. Stack rank
    shown as a superscript (`↑¹`, `↑²`).
  - **Drag** → reorder columns (drop on another header to insert before).
  - **Right-edge drag** → resize the column.
- **`<ColumnsMenu>`** is the show/hide picker; one column is always pinned
  visible (cannot reduce to zero). Reset-to-defaults included.
- **Filtering** lives in `src/components/issue-filters.tsx` — six filter
  types (status, project, assignee, label, priority, type) with searchable
  multi-select pickers. `applyFilters(issues, filters)` is the hot path.
- **Sort comparators** in the same file. Per-field comparator returns 0 on
  ties; `applySortStack` chains them and uses issue id only as the final
  deterministic tiebreaker. (The earlier per-field id fallback broke
  stacking — don't reintroduce it.)
- **Group order is sort-independent** — group keys come from the filtered
  list (canonical order: STATUSES order / PROJECT_INFO key order /
  alphabetical for assignees), sort applies *within* each group only.

This system is also the right place to extend if more views need a
configurable table.

---

## 8. Routing map

Top-level routes (defined in `src/App.tsx`):

| Route | Component |
|---|---|
| `/` | redirects to `/login` |
| `/login` | `LoginPage` |
| `/setup` | `SetupPage` (first-run wizard) |
| `/invite/:token` | `AcceptInvitePage` |
| `/design-canvas` | `DesignCanvasPage` (visual reference) |
| `/:workspace` | redirect → `/:workspace/comet` |
| `/:workspace/inbox` | `InboxPage` |
| `/:workspace/my-issues` | `MyIssuesPage` |
| `/:workspace/all-issues` | `AllIssuesPage` |
| `/:workspace/projects` | `ProjectsPage` |
| `/:workspace/workflows` | `WorkflowsPage` |
| `/:workspace/teams` | `TeamsPage` |
| `/:workspace/teams/:teamSlug` | `TeamDetailPage` |
| `/:workspace/settings/{general,members,profile}` | `SettingsLayout` |
| `/:workspace/:project` | `ProjectOverviewPage` |
| `/:workspace/:project/board` | `BoardPage` |
| `/:workspace/:project/list` | `ListPage` |
| `/:workspace/:project/workflow` | `WorkflowPage` |
| `/:workspace/:project/issue/new` | `CreateIssuePage` (modal route) |
| `/:workspace/:project/issue/:key` | `IssueDetailPage` |
| `/:workspace/:project/members` | `ProjectMembersPage` |
| `/:workspace/:project/settings` | `ProjectSettingsPage` |
| `*` | 404 (`<ErrorState>`) |

---

## 9. Fixtures

`src/fixtures.ts` is the single source of demo data. It contains:

- `ISSUES` — ~26 issues across Comet / Orbit / Atlas. Core fields: `id`,
  `type`, `title`, `status`, `priority`, `assignee`, `labels`, `updated`,
  `estimate`, `project` (slug), `startDate?`, `endDate?`. Relations
  (all denormalised, both ends stored): `parent?`, `children?`,
  `relatedTo?`. See `docs/product.md` for the hierarchy rules.
- `PROJECT_INFO` — the three projects with name, key, letter, color, bg.
- `MEMBERS` — workspace member roster (used by Settings → Members and
  every member-picker).
- `TEAMS` — three teams (Backend, Frontend, Design) with overlapping
  rosters.
- `PROJECT_MEMBERS` — per-project access: `{ teamSlugs, userEmails }`.
  Effective members are computed via `projectEffectiveMembers(slug)`.
- `WORKFLOWS` — three workflow definitions (default · epic-coarse ·
  epic-detailed). Nodes carry layout coordinates because the editor's
  visual layout is data-driven.
- `PROJECT_WORKFLOWS` — `{ project: { issueType: workflowId } }`. Two
  Epic workflows demonstrate per-project assignment (Comet/Orbit use
  `epic-coarse`, Atlas uses `epic-detailed`).
- `CURRENT_USER` — mocked Jordan Lee.

Helpers: `issueById`, `memberByEmail`, `teamBySlug`,
`projectEffectiveMembers`, `projectsForTeam`, `projectsUsingWorkflow`.

When a screen needs to vary by project or workspace, read from these
fixtures via `useWorkspaceContext()` (defined in `shell.tsx`) — it pulls
`workspace` and `project` from the URL with sensible fallbacks (`acme`,
`comet`).

---

## 10. Conventions

- **Inline styles** are fine. They keep the design tokens close to the
  layout they affect. Only extract a CSS rule when something is reused
  cross-component or needs a pseudo-class.
- **Comments**: don't restate what the code does. Use comments to explain
  *why* something is non-obvious. The repo already has `Drift fix:`
  callouts where designer drift was reverted; preserve those.
- **No emojis** in source unless explicitly asked.
- **Routing convention**: workspace-level routes match `/:workspace/X`,
  project-level routes match `/:workspace/:project/X`. Always use
  `useWorkspaceContext()` to derive paths — never hardcode `/acme/`
  unless the surrounding context is genuinely the design canvas demo.
- **Persistence**: `localStorage` is fine for user-preference state (column
  layout, per-project board config) AND for runtime workspace state that the
  prototype lets the user mutate (currently: projects created via the New
  project flow, keyed `bira:projects` and merged with `SEED_PROJECTS` by
  `ProjectsProvider`). Other "real data" (issues, comments, members) stays
  in fixtures until the backend lands. When you add a new persisted key,
  update the TL;DR list in this file.
- **Don't add new dependencies** without checking with the user first.
  The current dep list is intentionally tight.

---

## 11. Running, building, type-checking

```bash
npm install            # one-time
npm run dev            # Vite dev server on http://localhost:5173
npm run build          # tsc -b && vite build (used to verify compile)
npm run preview        # serve the production build
npx tsc --noEmit       # type-check only, faster than `build`
```

There are **no automated tests yet** (this is a known gap; see backlog).
The build is the only correctness gate today.

---

## 12. Backlog / known gaps

The full audit punchlist (P0–P3, 38 items) is in conversation history.
P0–P2 were burned down before this commit. P3 (still open) is mostly
visual / a11y polish:

- Sidebar / Tabs / dropdowns use `<div>` instead of `<button>`. Keyboard
  nav and screen readers don't see them as interactive.
- Modals (`CreateIssuePage`, member-picker, etc.) lack focus trap, focus
  restore, `role="dialog"`, `aria-modal`.
- Form inputs missing real `<label>` elements (placeholders only).
- No global `:focus-visible` outline.
- Comment composer is a `<div>` placeholder, not a real `<textarea>`.
- No dark mode (tokens are light-only).
- No `prefers-reduced-motion` support.
- No tests at all.
- Tooltips are CSS pseudo-elements (`[data-tip]:hover::after`) — they get
  clipped by ancestor `overflow: hidden`. Affected cards have been
  un-clipped where needed; a portal-based `<Tooltip>` would fix it once
  for the whole codebase.

Substantive feature gaps to consider when scope expands:

- Workflow editor: graph nodes don't drag, edges aren't drawable; rule
  add/remove works but state-add/delete UI is read-only on the canvas.
- Comments are flavor text — typing into the composer doesn't append.
- Bulk-action bar buttons don't open menus.
- Search input opens the command palette but ⌘K command palette doesn't
  do real search beyond the static command + issue list.
- No notifications — bell shows mock items only.

---

## 13. Memory

User-level memory for this project lives at the path printed by Claude
on session start. `MEMORY.md` in that directory indexes all entries.
Notable entries:

- `project_tenant_refactor.md` — in-flight tenant-above-workspace work
- `project_planner_mode.md` — Gantt-as-planner spec (not yet built)
- `project_backend_phase.md` — backend phase started 2026-05-04;
  layering ported from ABHA; first slice = tenants/workspaces/users/login

---

## 14. Skills available

This repo defines four operating modes for Claude (under `.claude/commands/`):

- **`/tech-lead`** — plan, decompose, delegate. Doesn't write code directly;
  spawns subagents that invoke `/be-dev` or `/fe-dev`. Has Debug and Review
  sub-modes.
- **`/product-lead`** — frame problems, validate hypotheses, prioritize, kill
  features. Has Discover, Define, Prioritize, Review, GTM modes.
- **`/be-dev`** — backend implementation persona. Currently aspirational —
  the backend doesn't exist yet, so this skill describes the conventions to
  follow once it does.
- **`/fe-dev`** — frontend implementation persona. Directly applicable today.

When work feels like more than a 3-edit task, the right move is usually to
invoke `/tech-lead` first.
