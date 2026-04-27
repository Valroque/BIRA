# BIRA — Project context for Claude

This file is the load-bearing brief for any Claude session working on BIRA.
Read the TL;DR. Skim the rest before making changes; the rest of the
codebase will make sense faster.

---

## TL;DR — if you only read this

1. **Frontend prototype only.** No backend, no real auth, no API client. Do
   NOT propose backend / persistence / fetch work — the user has explicitly
   chosen a design-first phase. Wiring real submit handlers also off-limits.
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
6. **Out of scope for v1**: sprints, backlog grooming, sub-tasks under epics,
   custom fields, JQL, SSO, integrations, notifications, public REST API,
   granular roles. Full list in `.claude/rules/v1-constraints.md`.
7. **State**: in-memory fixtures only (`src/fixtures.ts`), plus a few
   `localStorage` keys: `bira:list-layout` (column UI prefs),
   `bira:board-columns:<workspace>:<project>` (per-project board config),
   `bira:projects:<workspace>` (user-created projects, scoped per workspace —
   `ProjectsProvider` is mounted per workspace inside `WorkspaceLayout` and
   only seeds `SEED_PROJECTS` for the demo `acme` workspace), and
   `bira:workspaces` (user-created workspaces from the New workspace flow —
   merged with `WORKSPACES` by `WorkspacesProvider`). Workspace + project
   come from the URL via `useWorkspaceContext()` in `shell.tsx` — never
   hardcode `/acme/comet/`. Read project data via `useProjects()` from
   `src/state/projects.tsx`, and workspace data via `useWorkspaces()` from
   `src/state/workspaces.tsx` — never from stale `PROJECT_INFO` /
   `WORKSPACES`-direct lookups.
8. **Reuse, don't reinvent**: every layout primitive lives in
   `src/components/` (especially `shell.tsx`). Adding a parallel `<button>`
   styled like an existing `Chip` is a defect, not a shortcut.
9. **Design tokens only**. Use `var(--token)` from `src/index.css`. No raw
   hex codes outside the `/design-canvas` reference page.
10. **Build gate**: `npm run build` (or `npx tsc --noEmit` for a faster
    type-only pass). There is **no test infrastructure yet** — don't add
    Vitest/Jest configs without approval.

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

**Frontend prototype only.** No backend, no database, no real auth. Most
data is in-memory fixtures in `src/fixtures.ts` and edits don't persist; the
exceptions are written to `localStorage` (column-layout prefs, per-project
board config, and projects created via the New-project flow — see TL;DR
point 7 for the full key list).

The user has explicitly chosen to design-first: **do not propose backend or
API or DB work until the entire UI and flows are signed off.** Wiring real
state, authentication, or persistence is also off-limits during this phase.
This is a hard rule — see `feedback_design_first` in user memory.

---

## 3. Stack

- **Frontend**: Vite + React 18 + TypeScript at the repo root.
- **Routing**: `react-router-dom` v7. Router definitions live in `src/App.tsx`.
- **Styling**: plain CSS with design tokens in `src/index.css`. Inline styles
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
        ├── workflow.tsx      ← Graph editor + variants
        ├── rule-editor.tsx
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
- **Three roles**: `admin`, `write`, `read`. Ordered ladder
  (`read < write < admin`; write implies read, admin implies write). Roles
  can be assigned to **teams** (defaults) or **individual users** (overrides).
  Resolution: explicit-over-inherited — an explicit user grant wins over team
  grants, in either direction. Team grants combine via union (highest team
  role wins). Admin is only ever assigned explicitly to a user, never via a
  team. No granular per-feature permissions in v1.
- **Explicitly out of scope for v1** (deferred — do not add):
  Sprints / backlog / burndown · Sub-tasks below Epic · Granular
  roles · Notifications + @mentions + watchers · Custom fields · Custom
  per-project workflow editor UI · Reports / dashboards · JQL · Integrations
  (Git/Slack/webhooks) · SSO/SAML · Public REST API.

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
| `/:workspace/:project/workflow/rules` | `RuleEditorPage` |
| `/:workspace/:project/issue/new` | `CreateIssuePage` (modal route) |
| `/:workspace/:project/issue/:key` | `IssueDetailPage` |
| `/:workspace/:project/members` | `ProjectMembersPage` |
| `/:workspace/:project/settings` | `ProjectSettingsPage` |
| `*` | 404 (`<ErrorState>`) |

---

## 9. Fixtures

`src/fixtures.ts` is the single source of demo data. It contains:

- `ISSUES` — ~26 issues across Comet / Orbit / Atlas. Each issue has
  `id`, `type`, `title`, `status`, `priority`, `assignee`, `labels`,
  `updated`, `estimate`, and `project` (slug).
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

Helpers: `memberByEmail`, `teamBySlug`, `projectEffectiveMembers`,
`projectsForTeam`, `projectsUsingWorkflow`.

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

User-level memory for this project lives at:

```
/home/valroque/.claude/projects/-home-valroque-Documents-projects-BIRA/memory/
```

Key entries to read on a fresh session:

- `project_bira_goal.md` — what BIRA is and who it's for
- `project_stack.md` — Node-on-host + Postgres-as-config decision
- `project_scope_v1.md` — full v1 scope, workflow scope (revised),
  transition-rule decisions
- `feedback_design_first.md` — hard rule about no backend until UI ships

`MEMORY.md` in that directory indexes all entries.

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
