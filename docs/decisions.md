# BIRA — Decision log

Append-only log of product and architecture decisions. Newest at the
top. Each entry: date, what changed, why.

This is the **why**. The **what is currently true** lives in
[`product.md`](./product.md) and the load-bearing rules live in
[`../.claude/rules/v1-constraints.md`](../.claude/rules/v1-constraints.md).
When a decision here contradicts an older entry, the older one stays
in the log unedited — the log is a history, not the current state.

---

## 2026-04-27 — Themes added; hierarchy clarified

**Decision.** Introduced **Themes** as an orthogonal grouping entity.
Themes are flat (no parent/child themes), have no workflow, and connect
many-to-many to issues across all types. Stored symmetrically on both
sides (`Issue.themes` and `Theme.issues`).

Clarified the issue hierarchy:

- Epic → Story → Task/Bug
- Epic → Task/Bug (Tasks and Bugs can sit directly under an Epic)
- Story → Task/Bug only (no nested stories, no epic-of-epic)
- Task/Bug are always leaves

**Why.** Some long-running cross-cutting concerns ("performance",
"onboarding") don't fit the issue lifecycle — they outlive epics and
span multiple of them. Forcing them into the issue tree as fake epics
muddies what an Epic means. A separate orthogonal entity keeps the
hierarchy honest and gives long-running concerns a home.

**Tradeoff.** Themes add a new top-level concept the user has to learn.
Mitigated by keeping themes very small in v1 — name, description,
color, and a list of linked issues. No status, no owner, no theme
hierarchy.

---

## 2026-04-27 — Parent/child relations and `relates` link added

**Decision.** Issues gain a single optional `parent` plus a `children`
array (denormalized — both sides store the relation). The only
issue-to-issue link type in v1 is **`relates`**: symmetric, untyped,
stored on both ends as `relatedTo: string[]`.

`blocks`, `duplicates`, `causes`, and similar link types are deferred.
No "blocked by linked issue" transition rule is added (since `blocks`
doesn't exist yet).

**Why.** People expect *some* way to express that two issues are
connected. JIRA's full link-type catalogue is overkill for v1 and
introduces a maintenance surface (typed verbs with inward/outward
naming, custom types). Starting with one symmetric link type covers
the most-common case ("see also") without committing to the full
machinery. The shape is generic enough that adding `blocks` later
doesn't need a migration.

---

## 2026-04-27 — Sub-tasks dropped from v1

**Decision.** No sub-tasks. The hierarchy stops at Task/Bug.

**Why.** Sub-tasks are a JIRA construct that mostly serves as a
checklist on a parent issue. They're a separate issue type with their
own constraints (must have a parent, can't be parented to another
sub-task) and add real complexity to filters, workflows, and reports.
For v1's small-team audience, plain checkboxes inside an issue
description, or breaking the work into peer Tasks, both seem to cover
the use case. Revisit when there's user demand.

---

## 2026-04-22 — Roles bumped from `admin / member` to `admin / write / read`

**Decision.** Three roles instead of two, with an ordered ladder
(`read < write < admin`). Roles can be assigned to teams (defaults) or
individual users (overrides). Resolution is **explicit-over-inherited**
— an explicit user grant wins over team grants in either direction
(including downgrades). Team grants combine via union (highest team
role wins). Admin is only ever assigned explicitly.

**Why.** Two roles couldn't express the common "everyone in this team
can read project X but only the leads can write" pattern. Three roles
plus team-as-default + user-as-override hits that pattern with a small
schema. Avoided granular per-feature permissions because they balloon
the surface area without a clear v1 use case.

---

## 2026-04-15 — Workflows became per-(project, issue_type), not per-(workspace, issue_type)

**Decision.** A `(project, issue_type)` pair selects one workflow.
Multiple workflows can exist for the same issue type — projects share
or each pick their own.

**Why.** The earlier "one workflow per `(workspace, issue_type)`" rule
broke when a real customer wanted two distinct Epic workflows in the
same workspace (one coarse, one detailed) used by different projects.
Per-project assignment with a shared workflow library handles both.

---

## 2026-04-10 — Workflows are graphs, not DAGs

**Decision.** Workflows are directed graphs with cycles allowed.

**Why.** Reopen, request-changes, send-back-for-revision are all
back-edges. Forcing a DAG would mean modelling reopen as a different
node ("Reopened" status), which fragments status semantics and makes
filters harder. Cycles are needed; the layout still pays off in the
common case (forward progression).

---

## 2026-04-10 — Transition rules are a closed enum of five

**Decision.** Five rule types, no scripting language: `role`,
`assignee_only`, `reporter_only`, `required_fields`, `not_self`.

**Why.** A scripting language is a bottomless pit (security, sandboxing,
docs, debug UX). Five well-named rules cover the cases the team has
actually wanted in JIRA / Linear (admin-only transitions, "only the
assignee can move from In Progress", required field gates, "the
reporter can't approve their own change"). Earlier drafts also had
`approver` and `external_check` types — those got removed as designer
drift.

---

## 2026-04-08 — Frontend-first; no backend until UI ships

**Decision.** Build the entire UI and flows on fixtures + localStorage
before starting any backend, API, or persistence work. Wiring real
submit handlers is also off-limits during this phase.

**Why.** Designing the data model from a working UI surfaces
constraints that a paper schema misses. The user explicitly chose this
sequence after early prototypes had backend stubs that constrained UI
choices.
