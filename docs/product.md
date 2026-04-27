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
status (driven by its workflow), priority, assignee, labels, and
optionally a start and due date.

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

The only link type in v1 is **`relates`** — symmetric, generic. Stored
as a `relatedTo: string[]` of issue ids on each side. If A relates to B,
A's array contains B *and* B's contains A.

Other link types (`blocks`, `duplicates`, `causes`) are deferred to a
later version. No "blocked by linked issue" transition rule yet.

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
