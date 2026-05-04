# BIRA v1 — hard constraints

These are deliberate v1 decisions, not defects. Don't propose changes to them
without explicit user approval; if a request implicitly violates one, surface
it before implementing.

For the *why* behind these decisions, read [`docs/decisions.md`](../../docs/decisions.md).
For the product narrative + entity model in plain language, read
[`docs/product.md`](../../docs/product.md).

## Product

- **Multi-tenant via path slug** — every URL is `/:workspace/...`. No
  subdomain routing.
- **Kanban only** — no sprints, backlog grooming, burndown, story points.
- **Three roles** — `admin`, `write`, `read`. Ordered ladder:
  `read < write < admin` (write implies read; admin implies write). Roles
  can be assigned to **teams** (defaults) or **individual users** (overrides).
  Resolution is **explicit-over-inherited**: an explicit user grant wins over
  any team grants, in either direction (including downgrades). Team grants
  combine via union — the highest team role wins. **Admin is only ever
  assigned explicitly to a user, never inherited from a team.**
- **Workflow data shape**:
  - Workflows are first-class entities with stable ids.
  - `(project, issue_type)` selects one workflow. Multiple workflows can
    exist for the same issue type; projects share or each pick their own.
  - Workflows are directed graphs (cycles allowed — needed for reopen,
    request-changes).
- **Transition rules** are a closed enum of five types (`role`,
  `assignee_only`, `reporter_only`, `required_fields`, `not_self`). No
  scripting language. No "approver" or "external check" types — those were
  designer drift and have been removed.
- **Issue types** — Task, Bug, Story, Epic. Hardcoded for v1.
- **Effort estimates** are **required on Tasks** (Tasks are the unit of
  scheduled work; the Gantt and capacity views need a number to plan
  against). They're shown but optional on Bugs, and hidden on Stories
  and Epics — Stories/Epics roll up to leaves, so a separate estimate
  on the container would just drift.
- **Working week is Mon-Fri** — Saturday and Sunday are non-working
  days. **Holidays** in the `HOLIDAYS` set (ISO YYYY-MM-DD) count as
  non-working days too. None of these count toward effort capacity,
  working-day spans, or velocity math. Single tenant-agnostic policy
  for v1; per-tenant / per-region holiday calendars and per-team
  variations are deferred. Helpers in `fixtures.ts`:
  `WORKING_WEEKDAYS`, `WORKING_DAYS_PER_WEEK = 5`, `HOLIDAYS`,
  `isWorkingDay(iso)`, `isWorkingDate(date)`,
  `workingDaysBetween(start, end)`, `addWorkingDays(iso, n)`. The
  Gantt timeline shades both weekends and holidays; holidays additionally
  carry a tooltip with the holiday name.
- **Ideal velocity is `IDEAL_POINTS_PER_DAY = 4`** — one assignee
  delivers ~4 points of effort per **working** day (Sat/Sun and
  HOLIDAYS don't count). Single project-agnostic constant; no
  per-team or per-assignee overrides in v1. Used to translate effort
  points into working-day estimates ("≈ N working days at 4/day") in
  the inspector and future capacity views.
- **Squeezed bars are allowed but flagged.** A Task's `estimate` and
  its `startDate`/`endDate` are independent — the user can drag the
  Gantt bar tighter than the ideal duration (e.g., 12 pts in 1
  working day = 3× ideal). When the points-per-day exceeds
  `IDEAL_POINTS_PER_DAY`, the bar renders with a diagonal stripe in
  the blocked colour, gets a red border + alert icon, and the
  inspector surfaces an "Overworked: N pts/day (M× ideal)" callout
  beneath the Effort meta. `computeTaskLoad(estimate, start, end)`
  returns `{estimate, workingDays, pointsPerDay, overload}` when both
  dates and a positive estimate are present; `overload > 1.0` is the
  threshold.
- **Per-assignee daily load is surfaced when grouped by assignee.**
  The single-task check above doesn't catch the case where multiple
  reasonably-sized Tasks for the same person *overlap* on a day. On
  the Gantt, when grouped by assignee, each group's timeline row
  highlights every day where that assignee's combined scheduled
  pts/day exceeds the ideal — red day-cell wash, hover tooltip with
  the exact load + overload ratio, plus a red `⚠ N` chip in the
  group label showing how many days are over. Helper:
  `dailyLoadFor(items)` in `issues-gantt.tsx` produces the
  `Map<dayNumber, points>`. Bug-fix work and rolled-in fire drills
  often show up here even when each individual Task looks fine.
- **Issue hierarchy** is a shallow tree, not arbitrary nesting:
  - Epic → Story → Task/Bug
  - Epic → Task/Bug (Tasks/Bugs may sit directly under an Epic)
  - Story → Task/Bug only (no nested stories, no epic-of-epic)
  - Task / Bug are always leaves
  - At most one parent per issue. Stored on **both ends** — child carries
    `parent`, parent carries `children[]` — and they must stay in sync.
  - **Epics are top-level and cannot have a parent.** The Parent meta is
    hidden for `type === 'E'` and the parent picker offers no valid
    candidates (`allowedParentTypes` is empty for Epics).
  - **Stories require an Epic parent.** The parent picker for a Story only
    surfaces Epics, and the inspector hides the "clear parent" affordance
    for Stories so the requirement can't be circumvented. A Story without
    a parent is invalid; the detail page surfaces this with a "Pick an
    Epic" prompt instead of a generic "Not set".
  - **Schedules (start/end dates) live on Tasks and Bugs only.** Stories
    and Epics don't carry their own dates — the Gantt derives their span
    from the union of descendant Task/Bug dates. Inspector date editors
    are hidden for `type === 'S' | 'E'`.
- **Issue links** in v1:
  - **`relates`** — symmetric, untyped beyond the verb. Stored on both
    ends as `relatedTo[]`. Available on every issue type.
  - **`depends on`** — directed, **Task-only**. Semantics: A depends on
    B means A cannot start until B has ended. A Task may depend on
    multiple Tasks. Storage is symmetric for fast inverse lookup —
    `Issue.dependsOn[]` on the depender, `Issue.dependedOnBy[]` on the
    blocker. The graph **must be a DAG**: edits that would create a
    cycle are rejected at the picker (`dependsOnWouldCycle` filters
    candidates). Only valid when both ends have `type === 'T'`.
  - `duplicates` / `causes` are still deferred. `blocks` is subsumed
    by `depends on` (the inverse view) — there's no separate type.
- **Themes** are an orthogonal grouping entity:
  - Flat — no parent theme, no child theme, no theme-to-theme relation.
  - Connect to issues many-to-many; both sides store the relation
    (`Theme.issues[]` and `Issue.themes[]`).
  - No workflow, no end date — themes are long-running.
- **Symmetric relation storage**: parent/children, relatedTo, and
  theme membership are all denormalised — the relation lives on both
  records. Writes (when they exist) must update both sides.

## Out of scope for v1 (do not add without approval)

- Sprints / backlog / burndown
- Sub-tasks below Task/Bug (the leaf level)
- Issue link types other than `relates` and `depends on` (`duplicates`, `causes`, …)
- Granular roles beyond admin/write/read (no per-feature permissions, no
  resource-level ACLs, no custom role definitions)
- Notifications, @mentions, watchers, email digests
- Custom fields and the editor for them
- Reports, dashboards, charts
- JQL or any query language
- Integrations (Git, Slack, webhooks)
- SSO / SAML
- A public REST API (the web app doesn't need one for v1)

## Engineering

- **Backend phase started (2026-05-04).** Backend code lives under
  `server/` (Node + TS + Express + Knex + Postgres). Layering is
  ported from ABHA — see `server/README.md`. First slice: tenants,
  workspaces, users, login. Issues / themes / workflows / boards /
  comments stay fixture-driven on the FE until their respective
  backend phases land. **The FE is not yet wired to the API** —
  don't add `fetch` / `axios` calls from `web/` until the phase
  explicitly says so.
- **No Docker for the Node app.** Backend runs on the host (`npm run dev`
  in `server/`); Postgres is the only piece in a container locally /
  managed in cloud.
- **No new dependencies** without explicit approval. Keep the dep list tight.
- **No emojis** in source unless asked.
