# BIRA — Product

A living document that describes what BIRA is, who it's for, and the
shape of its data. If you're new to the project, read this first; the
codebase will make sense faster afterwards.

For *why* a particular decision was taken, see
[`decisions.md`](./decisions.md). For the rules a contributor must not
break without explicit sign-off, see
[`../.claude/rules/v1-constraints.md`](../.claude/rules/v1-constraints.md).

---

## What BIRA is

BIRA is a **self-hostable, open-source JIRA alternative** for project and
issue tracking. The intended audience is small-to-mid teams that want to
run their own tracker on their own infra rather than paying a vendor.

The tone aim is closer to **Linear / GitHub Issues** than to Atlassian's
JIRA — dense, keyboard-friendly, opinionated. v1 is deliberately small;
several JIRA features are out of scope.

---

## Core entities

There are five things to understand. Three are containers
(Workspace → Project → Issue). One is the rules engine (Workflow). One
is an orthogonal grouping (Theme).

### Workspace

The tenant boundary. A user can belong to multiple workspaces and picks
one after sign-in (see `/workspaces`). Each workspace owns its own
projects, teams, and members; nothing crosses the boundary.

URL shape: `/:workspace/...` — path slug, not subdomain.

Roles are workspace-scoped: `admin > write > read` (an ordered ladder —
write implies read, admin implies write). Roles can be assigned to teams
(defaults) or individual users (overrides). Resolution is
**explicit-over-inherited**: an explicit user grant wins over team
grants in either direction. Team grants combine via union (highest
team role wins). **Admin is only ever assigned explicitly to a user**,
never inherited from a team.

### Project

A workspace contains many projects. A project has a name, a key (used
to namespace issue ids — e.g. `CMT-241` lives in `comet`), members, and
a workflow per issue type.

URL shape: `/:workspace/:project/...`.

### Issue

The unit of work. Every issue has a type (Task, Bug, Story, Epic), a
status (driven by its workflow), priority, assignee, and labels.

**Schedules** (start / end dates) live on **Tasks and Bugs only** —
they're the ground truth for "when work happens." Stories and Epics
don't carry their own dates; their span on the Gantt is **derived** from
the union of descendant Task/Bug dates and is read-only there. Inspector
date editors are only shown for `type === 'T' | 'B'`.

**Effort estimates** are **required on Tasks** — Tasks are the unit of
scheduled work, and the Gantt + capacity views need a number to plan
against. Effort is optional on Bugs (handy context but not enforced)
and hidden on Stories / Epics, which roll up from leaves.

Ideal velocity is **`IDEAL_POINTS_PER_DAY = 4`** — one assignee
delivers ~4 points of effort per **working** day. A working day is
Mon-Fri minus any date in the `HOLIDAYS` set (currently
`['2026-05-01']` — Labour Day). The inspector renders a "≈ N working
days at 4/day" hint alongside any effort value so the planner can read
calendar implications without doing the math. Single tenant-agnostic
constant for v1; per-team / per-assignee / per-region overrides are
deferred.

The Gantt visualises non-working days: weekends are shaded with the
neutral subtle surface, holidays with a faint warm wash and the holiday
name as a hover tooltip.

**Squeezed bars are allowed but flagged.** A Task's effort estimate and
its scheduled dates are kept independent on purpose — the planner can
drag a 12-pt bar from 3 working days down to 1 working day and the
system accepts it. But it makes the cost obvious: the bar renders with
a diagonal stripe in the blocked colour and a red border + alert icon,
and the issue inspector surfaces an "Overworked: 12 pts/day (3× the
4/day ideal)" callout under the Effort meta. The math comes from
`computeTaskLoad(estimate, start, end)` in `fixtures.ts`, which returns
`{estimate, workingDays, pointsPerDay, overload}`; anything with
`overload > 1.0` is over-capacity.

#### Hierarchy (parent / child)

Issues form a shallow tree:

```
Epic
├── Story
│   ├── Task
│   └── Bug
├── Task        ← Tasks/Bugs may sit directly under an Epic
└── Bug
```

Rules:

- **Epic** has no parent. Children: Story, Task, Bug.
- **Story** parent must be an Epic. Children: Task, Bug.
- **Task / Bug** are leaves. Parent can be Epic *or* Story.
- No epic-of-epic, no nested stories, no sub-tasks below the leaf level.

Storage is **symmetric and denormalized**: a child's `parent` field and
the parent's `children` array both store the relation. Writes have to
keep both sides consistent.

#### Issue ↔ Issue relations (links)

Two link types in v1:

**`relates`** — symmetric, untyped beyond the verb. Available on every
issue type. Stored as `relatedTo: string[]` of issue ids on each side;
if A relates to B, A's array contains B *and* B's contains A.

**`depends on`** — directed, **Task-only**. A *depends on* B means A
cannot start until B has ended. A Task can depend on multiple Tasks.
Storage is symmetric for fast inverse lookup: each Task carries
`dependsOn: string[]` (predecessors — what blocks it) and
`dependedOnBy: string[]` (successors — what it blocks). The graph
**must stay a DAG** — edits that would close a cycle are rejected at
the picker (`dependsOnWouldCycle` filters out invalid candidates). The
inspector for a Task surfaces both directions: a "Depends on" list with
add/remove, and a read-only "Blocks" list when other Tasks depend on
this one.

Other link types (`duplicates`, `causes`) are deferred to a later
version. The "blocks" verb is subsumed by the `depends on` inverse —
there's no separate type. No "blocked by linked issue" transition rule
yet — the dependency graph drives Gantt semantics, not transition
guards.

### Workflow

A workflow is a directed graph of statuses with transitions between
them. Cycles are allowed and necessary — reopen, request-changes,
send-back-for-revision are all back-edges.

Each `(project, issue_type)` selects exactly one workflow. Multiple
workflows can exist for the same issue type — projects share or each
pick their own.

Each transition can carry **rules** (guards). The rule list is a closed
enum of five (no scripting language):

1. `role` — acting user has role X (admin / write / read)
2. `assignee_only` — acting user is the issue's assignee
3. `reporter_only` — acting user is the issue's reporter
4. `required_fields` — listed fields must be set on the issue
5. `not_self` — acting user is NOT the reporter

### Theme

An orthogonal grouping for long-running concerns that don't fit the
issue lifecycle. Themes are **logical containers** — flat, no
workflow, no end date — that connect to issues across types.

Examples (the intent, not concrete fixtures): "Performance",
"Onboarding revamp", "Customer trust". A theme persists across
quarters; the issues attached to it come and go.

Rules:

- Themes have **no hierarchy** — no parent theme, no child theme.
- Themes link to **Epics, Stories, Tasks, Bugs** via a many-to-many
  membership: `Issue.themes: string[]` of theme ids on the issue side,
  `Theme.issues: string[]` of issue ids on the theme side. Both sides
  store the relation.
- Themes do **not** relate to other themes.

A theme has just `{ id, name, description, color }` for v1 — no status,
no owner. New fields can be added later without a refactor.

---

## What's out of scope for v1

Listed because every one of these is a thing JIRA does and people will
ask for. Don't add any of these without explicit sign-off:

- Sprints, backlog grooming, burndown, story points
- Sub-tasks below the leaf (Task/Bug)
- Issue links beyond `relates` (`blocks`, `duplicates`, `causes`, …)
- Granular roles beyond admin / write / read
- Notifications, @mentions, watchers, email digests
- Custom fields and the editor for them
- Reports, dashboards, charts
- JQL or any query language
- Integrations (Git, Slack, webhooks)
- SSO / SAML
- A public REST API

---

## Engineering posture

- **Frontend-first phase.** No backend, no API, no real auth. Most data
  lives in `src/fixtures.ts`; a few user prefs persist to
  `localStorage`. Wiring real submit handlers is also off-limits during
  this phase.
- **No Docker for the Node app** when the backend lands — Postgres is
  the only piece in a container locally / managed in cloud.
- **No new dependencies** without explicit approval. The dep list is
  intentionally tight.

The technical brief that codifies this for Claude lives at
[`../CLAUDE.md`](../CLAUDE.md). The hard rules a contributor must not
silently break live at
[`../.claude/rules/v1-constraints.md`](../.claude/rules/v1-constraints.md).
