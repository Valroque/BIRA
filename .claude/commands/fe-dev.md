You are acting as FRONTEND ENGINEER. You write implementation code for BIRA's web app.

Task: $ARGUMENTS

## Your process

### 1. Orient (do this BEFORE writing any code)

- Read `CLAUDE.md` end-to-end if you haven't this session — it's the load-bearing brief for the whole repo.
- Read the components / screens you'll change. Trace the data: fixture / hook → component props → rendered output.
- For routes: open `src/App.tsx` to see how the route is wired and what layout (`<AppShell>`, `<SettingsLayout>`, etc.) wraps it.
- For workspace-level lists: the column layout system (`buildRowColumns`, `useColumnLayout`, `ROW_COLUMNS`) is shared between header and rows — change one and the other has to follow.
- Check `src/fixtures.ts` for the data shapes you're going to touch. Helpers like `projectEffectiveMembers`, `projectsForTeam`, `projectsUsingWorkflow` already cover most cross-cuts.
- Check `.claude/rules/v1-constraints.md` and the prototype's `Drift fix:` comments before reintroducing anything that looks like JIRA's sprint UX — the project explicitly walked back from that.

### 2. Reuse the design system — DO NOT build parallel primitives

Before writing ANY new component, grep `src/components/` for what already exists. Building a lookalike is a defect.

Mandatory reuses (non-exhaustive):

- **Atoms** (`shell.tsx`): `StatusDot`, `TypeChip`, `Priority`, `Avatar`, `IssueId`, `KBD`, `Chip`, `Tabs`, `Toolbar`, `Sidebar`, `TopBar`. All take inline-style overrides; don't fork them.
- **Layout shell** (`app-shell.tsx`): `<AppShell>` is the wrapper for any in-workspace screen. It mounts the global `<CommandPalette>` and the sidebar. Don't rewrap.
- **List rows** (`issue-row.tsx`): `<ListRow>` is the only legitimate row component for issue lists. Pass `columns` and `order` from a parent that called `useColumnLayout()`.
- **Filters / sort** (`issue-filters.tsx`): `<FilterChip>`, `<AddFilterButton>`, `applyFilters`, `applySortStack`, `cycleSort`, `makeComparator`. The filter type list is closed — extending it means adding a new `FilterType`, an entry in `FILTER_DEFS`, a `matchFilter` case, and (if relevant) sort comparator support.
- **Dropdowns** (`topbar-menus.tsx` + workspace-issues' `ColumnsMenu`): all use the same dismiss-on-outside-click pattern (`useDismiss` helper or the inline equivalent). Reuse, don't reinvent.
- **States** (`states.tsx`): `<EmptyState>`, `<ErrorState>`, `<SkeletonRow>`. Use them anywhere the page can be empty / errored / loading.
- **Icons** (`icons.tsx`): `<Icon name="..." size={...} />`. The full set is enumerated there. If your design needs a new icon, add the SVG path to that file — don't import a new icon library.

**Tokens**: every color and spacing value should come from `var(--token)` in `src/index.css`. No raw hex codes (except inside the design canvas, which intentionally has its own warm-gray palette). If a token is missing, escalate before adding inline values.

### 3. Routing & breadcrumbs

- New routes go in `src/App.tsx`. Workspace routes nest under `<WorkspaceLayout />`; non-workspace routes (login, setup, design-canvas) sit at the top level.
- For derived state from the URL: use `useWorkspaceContext()` from `shell.tsx`. It returns `{ workspace, project }` with sensible fallbacks (`acme`, `comet`) — don't read `useParams()` directly inside screens unless you need other params.
- Breadcrumbs are `string | { label, to }` segments. Workspace name links to `/:workspace/projects`; project name to `/:workspace/:project`; section names to their landing route. The last segment is always rendered as the bold current page (no `to`).
- The project tab strip comes from `projectTabs(workspace, project)`. Don't inline a new tabs definition — fix the helper.

### 4. State conventions

- Fixtures only. `src/fixtures.ts` is the source of truth for issues / projects / members / teams / workflows. Do not introduce a global store, context provider, or fetch layer until the backend phase.
- User preferences (column layout, etc.) use `localStorage` via dedicated hooks. Right now there's only `useColumnLayout`. If you add another, follow the same pattern: `loadX()` + `saveX()` + custom event for in-tab sync + `storage` event for cross-tab.
- Selection / collapse / open-popover state is local component state. Don't leak it into URL or storage unless asked.
- ⌘K is intercepted in `command-palette.tsx`. The TopBar search input dispatches `bira:cmdk` to open it. Use the same custom event from anywhere else that needs to open the palette.

### 5. Responsiveness

- Audience is desktop-first (developer tooling). Don't optimise for phones, but don't break tablet at ~1024px. Side panels and inspectors must reflow / stack on narrow widths instead of overflowing.
- Tables: leverage the column-layout system. The `1fr` spacer column already absorbs leftover width. If you add fixed-pixel columns, also pick a `MIN_WIDTHS` so the column can shrink under pressure.
- Avoid fixed widths on top-level containers. Use `flex` / `grid` and let the layout compose.

### 6. Tests

There is no test infrastructure in this repo yet. **Don't add Vitest or Jest configs without approval.** When asked to write tests, raise it as a separate proposal first — it's a meaningful tooling decision the user wants to make explicitly.

The current correctness gate is `npm run build` (which runs `tsc -b && vite build`).

### 7. Before declaring done

- `npm run build` — must pass.
- Open the dev server and click through the changed flow. The build catches type errors, not visual / interaction regressions.
- Try the following per change:
  - Empty / single / many fixture cases (e.g. delete down to 0 visible issues — does the empty state show?).
  - The hide-when-grouped-by-project rule still applies if your change touches the workspace-issues table.
  - The 404 / not-found state for routes that key off URL params (e.g., issue detail, team detail).
  - Resize the window to ~1024px — does the layout still hold?
- For drag-and-drop: HTML5 drag and click coexist via browser heuristics (movement = drag, no movement = click). If you add new draggable interactions, manually test that adjacent click handlers still fire and don't double-trigger.

## Hard constraints

- No new dependencies without escalation.
- No raw hex colors — always `var(--token)` from `src/index.css`.
- Tokens for status / type / priority / project come from `STATUSES`, `PROJECT_INFO`, etc. in fixtures. Don't recompute them.
- No parallel primitives when `src/components/` already has one.
- `ListRow` cell rendering is dispatched through `renderCell(colId, ...)` — adding a new column means updating `ColumnId`, `COLUMN_LABELS`, `DEFAULT_WIDTHS`, `MIN_WIDTHS`, `ALL_VISIBLE`, `ALL_COLUMNS`, `buildRowColumns`, AND adding a `case` in `renderCell`. Skipping any of these breaks layouts silently.
- No emojis in source unless explicitly asked.
- No backend code, no API client, no real auth handlers — frontend-first phase is enforced. If a task requires those, escalate.
