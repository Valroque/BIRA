# BIRA — Decision log

Append-only log of product and architecture decisions. Newest at the
top. Each entry: date, what changed, why.

This is the **why**. The **what is currently true** lives in
[`product.md`](./product.md) and the load-bearing rules live in
[`../.claude/rules/v1-constraints.md`](../.claude/rules/v1-constraints.md).
When a decision here contradicts an older entry, the older one stays
in the log unedited — the log is a history, not the current state.

---

## 2026-05-08 — RBAC open questions (#21 slice 2): self-leave, demotion, reactivation, archive

Closing out seven of the eight open questions on the RBAC tracking
issue (#21). Q1 (workspace last-admin invariant) was resolved
separately by tech-lead — tenant admins count as implicit fallbacks,
so a workspace with one explicit admin and one tenant admin in the
same tenant can still demote/remove the explicit admin. The rest
follow below. The role matrix in `docs/specs/permissions.md` (slice
3) and the test pass (slice 4) encode these decisions.

### Q2 — Self-leave is workspace-and-tenant only in v1

Decision: keep self-leave on the two scopes where it already exists
(`DELETE /api/tenants/:t/members/:userId` and `DELETE
/api/tenants/:t/workspaces/:w/members/:membershipId`, with the
caller's userId matching the target). **Project self-leave and team
self-leave are not added in v1.** Anyone wanting off a project or a
team asks an admin (workspace admin for projects, anyone with team
edit access for teams) to revoke them.

Why now and why this shape: tenant + workspace are the *containers*
the user opted into — symmetric for them to be able to walk away
without a gatekeeper. Project + team are *grants on top of a
membership* — the explicit grant exists because someone deliberately
added them. Adding a self-revoke surface there gives a daily user a
button labelled "Leave project" that, if they're the only person
with admin access, locks the project. The workspace-admin invariant
(Q1) catches that at the workspace boundary, but pushing the same
guard down to project + team would mean adding a "last edit-access
holder" check to four more code paths to protect against a problem
nobody has reported. Cost > benefit until someone asks.

UX surface for the existing two: the workspace-members list already
has a row-level Remove control on a member's own row (settings.tsx
treats self the same as an admin-removed target). Tenant self-leave
has no FE today — when it's wired, it goes in
`/:tenant/settings/profile` as a danger-zone "Leave tenant" button,
not in a member list (the user removing themselves rarely thinks
"find my row in the directory and click the trash icon").

Cascade rule for the unbuilt cases, if/when they're added:
team-member self-leave should drop the user from `team_memberships`
only — *not* cascade to `project_team_access`, because the team's
project grants are about the team as a unit, not about the
individual. The user already loses team-derived project access by
virtue of no longer being on the team; no extra cascade needed.

Implication for slice 3: matrix entries for "remove project
member" and "remove team member" are admin-or-write-only, no
self-leave column.

### Q3 — Demotion does not touch explicit grants

Decision: when a workspace admin is demoted to write or read, only
their *implicit* admin reach (the "workspace admin → effective
admin in every project" pathway computed at read time in
`listEffectiveMembers.ts`) goes away. Any **explicit**
`project_user_access` row they hold survives, at whatever role it
was granted at. This is just the explicit-over-inherited rule
(`.claude/rules/v1-constraints.md`) read in the demotion direction.

Worked example: Maya is workspace admin on the `acme` workspace.
Comet is a project in `acme`. Maya has no row in
`project_user_access` for Comet — her admin reach is implicit. Atlas
is also in `acme`; someone explicitly granted Maya `write` on Atlas
last quarter (a no-op at the time, since her workspace-admin
implicit reach was already broader). Today, an admin demotes Maya
to `write` at the workspace level. Result: on Comet she's now a
plain workspace `write` member with no project-specific row, so her
effective project role is `write`. On Atlas she still has the
explicit `write` grant, so she's `write` there too. The demotion did
exactly one thing — it removed the implicit admin pathway that
existed only because she was workspace admin. Nothing was deleted
from any access table.

Why this and not "demotion cascades to demote/delete project
grants": cascade-on-demote breaks the explicit-over-inherited
contract — the whole reason explicit grants exist is to be the
durable, auditable layer that doesn't move when inherited roles
shift. It also creates a footgun where the admin doing the demotion
has to remember every explicit grant the target ever received and
decide on each. The current behaviour ("we change one thing; the
rest persists") is easier to explain to the workspace admin on day
1: *"Demoting Maya only changes Maya's role on this workspace. Any
project where she has a separate grant keeps that grant — go to the
project's Members page if you want to revoke it too."*

Implication for slice 3: the matrix has no "demotion side-effects"
column — the row-level effect is just the role change.

### Q4 — Tenant admins surface where admin-relevance > opt-in concern

Decision: tenant admins appear as implicit members on surfaces
where their effective access is the load-bearing fact, and stay
hidden on surfaces where the question is "who has chosen to engage
here." Concretely:

- **Show as implicit (with a "Tenant admin" source pill):**
  - Workspace settings → Members (already does this; keep).
  - Project Members page (already does this via the
    `tenant-admin` provenance row; keep).
  - Effective-members views in any future audit / capacity surface.
- **Hide:**
  - The team-detail "Add member" picker. Already excludes them
    (`addable: !m.membershipId.startsWith('tenant-admin:')` in
    `teams.tsx`); keep. Tenant admins aren't team members the way
    explicit users are — putting them in a team grants them nothing
    they don't already have, and the team roster on a team-detail
    page is the human "who's on this team" question.
  - The New project modal's People-with-edit-access picker. They
    don't need a grant to be admin on the project, so offering the
    box is misleading: ticking it would write a row that is a no-op
    against the implicit pathway and survives a demotion (per Q3).
    Hidden today; keep.
  - Issue assignee picker. An assignee is a person doing the work,
    not a person with permission to do it. Tenant admins who don't
    explicitly belong to the workspace shouldn't be the suggested
    pick.

Principle to apply when a new surface comes up: ask *"is this
surface answering 'who can do this' or 'who is in this group'?"*
First case shows tenant admins; second case hides them.

Note for the slice-3 author: this is a clarification of existing
behaviour, not a feature removal — every surface listed above
already does the right thing, the rule above is so they stay
consistent when someone adds the eighth surface.

### Q5 — Already shipped; question was stale

The brief's premise (no FE consumes `updateUserAccess` /
`updateTeamAccess`) is out of date. The project-members page
(`web/src/screens/project-members.tsx`) has an in-row role picker
on both team-grant rows (`TeamGrantRow`, lines ~380–410) and
user-grant rows that calls `updateTeam` / `updateUser` from
`useProjectAccess()`, which proxies the BE update endpoints. Delete
+ re-grant is no longer the only path. No decision needed; no GH
issue filed.

### Q6 — Default team-grant role is `read`; but the modals disagree

Decision: keep `read` as the default for team grants in v1, but
**fix the inconsistency** between the two surfaces that grant teams.
Today:

- New project modal (`web/src/screens/projects.tsx:415`) hardcodes
  every selected team to `read` with no per-row picker, and tells
  the user to upgrade from the project Members page after creation.
- Project Members → Add team modal
  (`web/src/screens/project-members.tsx:582`) defaults to `write`
  with a per-row picker and a comment that says "write is the most
  common project-team grant."

Both can't be right. Going with `read` for both, for two reasons:

1. **Asymmetry of error cost.** A team granted `read` that should
   have been `write` produces a friction signal — someone tries to
   edit, gets blocked, asks for an upgrade. A team granted `write`
   that should have been `read` produces silent over-access and an
   audit miss. The default should fail loud, not quiet.
2. **The picker exists to override.** Defaulting to the *narrower*
   role and asking the granter to widen it is a conscious-act
   pattern; defaulting to the *wider* role hides the choice.

Implication for slice 3: matrix entry for "team grant default" is
`read`. Implication for the FE (filed as a follow-up issue, see
URLs at the end): change `AddTeamModal` in project-members.tsx to
default to `read` and update the code comment, and keep the picker.
The New project modal also shows a small "you can upgrade
individual teams later" hint — it stays accurate.

### Q7 — Reactivation restores prior grants as-is, with a loud audit trail

Decision: reactivating a deactivated user (`POST
/api/tenants/:t/members/:userId/reactivate`) is the inverse of
deactivate — it flips `users.is_active` back to `true` and
**leaves every dependent grant untouched**. Workspace memberships,
team memberships, project user-access rows are all already
preserved across deactivate (no cascade in `setUserActive.ts` or
`userService.setActive`); reactivate keeps that symmetry.

Why "restore as-is" and not "require re-grant":

- The deactivation use case BIRA is targeting in v1 is *temporary
  unavailability* (sabbatical, parental leave, contractor between
  engagements) — not *security incident*. Re-granting after a
  3-month parental leave is purely friction: every team, every
  project, every workspace they had to be re-added to.
- Tenant admins are the only role that can deactivate, and they're
  the same role that can demote / revoke — if a tenant admin
  *wants* a security-flavoured "deactivate and wipe all grants,"
  the path is still available manually before reactivation.
- "Restore as-is" matches what every other system in this space
  does (Linear, GitHub, Slack), so it matches expectation.

Trade-off explicitly acknowledged: if the deactivation **was** for
security reasons, the admin must remember to revoke the user's
grants *separately* before reactivating. This is documented loudly:

- The deactivate confirmation dialog text (settings.tsx today) gets
  a line: *"Deactivation freezes login but leaves project, team,
  and workspace access in place. If this is a security action,
  revoke the user's access from those scopes separately before
  reactivating."*
- The reactivate confirmation dialog gets a parallel line: *"This
  user's prior project, team, and workspace access is being
  restored. Review their grants if circumstances have changed."*

Implication for slice 3: the matrix has no "reactivation
side-effects" column — the row-level effect is just the
`is_active` flip. The two dialog-copy changes are filed as a
follow-up FE issue (URL below).

### Q8 — Workspace archive freezes mutations; unarchive restores everything; no GC

Decision: **archive is a soft-freeze.** Stating it explicitly so
nobody adds GC-on-archive in a future slice without another
decision-log entry.

What archive does today (`requireActiveWorkspace` middleware in
`tenantScope.ts`):

- Blocks writes under the workspace — any handler that mounts
  `requireActiveWorkspace` returns 409 with a "unarchive first"
  message.
- Reads continue to work (the middleware only runs on mutating
  routes).
- No data is deleted or moved. Projects, issues, comments, files,
  workflows, project-grants, team-grants, team memberships, and
  workspace memberships all persist on disk.

What unarchive does: flips `workspaces.status` back to `active`. No
other side-effects. Every grant, member, project, issue, comment,
file is exactly where it was — the workspace simply becomes mutable
again.

Why state this explicitly: the temptation to "tidy up" archived
workspaces (drop project-team grants, drop project-user grants,
delete drafts) is real and would silently change the user's mental
model from "archive is pause" to "archive is gradual delete." Pause
matches the Linear / Notion / GitHub pattern; gradual delete is a
trap that surfaces as "I unarchived and half my data is gone." We
pick pause.

Implication for slice 4: one test asserts that after archive →
unarchive, the listed effective members, project grants, and issue
counts are byte-identical to pre-archive. If that test ever
becomes hard to keep green, the fix is to keep the data, not to
weaken the test.

### Follow-up GH issues filed

- Q5: none — already shipped on the FE.
- Q6 default-role alignment: https://github.com/Valroque/BIRA/issues/43
- Q7 dialog copy: https://github.com/Valroque/BIRA/issues/44

The earlier "no @mentions" rule was bundled with notifications,
watchers, and email digests as a single out-of-scope line. Splitting
them: **mentions in comments are now in v1**; notifications stay
out of scope.

What changes:

- `@user` and `@team` chips in comment bodies, with a workspace-scoped
  picker (`GET .../mentionables/search`).
- Issue references (`COMET-42`) auto-link at render time, no special
  trigger.
- Storage uses typed tokens — `@[user:<uuid>]`, `@[team:<uuid>]` —
  forward-compatible for future entity types without a schema change.
  A denormalised `Comment.mentions` jsonb array (derived from the body
  on write) is the read index.

What stays deferred:

- **Notification fan-out.** Mentions render as chips; nobody gets
  pinged. When the notifications phase lands, `Comment.mentions` is
  the fan-out source — no body re-parse needed.
- Mentions in issue title/description, `@everyone` / `@here`, escape
  syntax, visibility-aware picker.

Why now: mentions are useful as a navigation / context affordance even
without notifications — clicking the chip jumps to the user/team page,
the comment thread reads better than `john@acme.com cc maria@acme.com`.
Promoting the storage shape now means the comments backend doesn't get
retrofitted later for typed tokens.

Why typed tokens (`@[user:uuid]` instead of bare `@uuid`): UUIDs are
shared across users, teams, attachments, projects. A bare uuid is
ambiguous to the renderer and to future fan-out logic. The type
prefix is cheap insurance.

Full spec: [`docs/specs/mentions.md`](./specs/mentions.md). Phasing
gated on the comments backend (not yet started).

## 2026-05-04 — DB FKs stay on UUIDs; slugs are URL-only

Considered switching foreign keys to slugs (e.g. `projects.workspace_slug`
instead of `projects.workspace_id`) on the grounds that slugs are
more user-friendly. Rejected.

Reasons:

1. **Slugs are mutable; UUIDs aren't.** A slug rename would either
   cascade through every child row or require freezing slugs at
   creation. Both options are worse than the status quo.
2. **Slugs aren't globally unique.** Workspace slugs are unique only
   within a tenant, project slugs only within a workspace. Using
   slugs as FKs forces composite keys (`tenant_slug`, `workspace_slug`,
   `project_slug`) on every child row, or denormalised parent slugs
   everywhere — both are heavier than a single UUID column.
3. **The user-friendliness lives at the URL/API layer already.** Routes
   are `/:tenant/:workspace/:project/...`; the boundary resolves slugs
   to UUIDs. Internal identity stays stable, URLs stay readable. This
   matches the pattern in JIRA / Linear / GitHub.

Rule for the backend phase: PK + FK columns are UUIDs. Slugs are
unique-within-scope strings used for routing and human-readable refs
in API payloads. Don't introduce `*_slug` foreign-key columns.

## 2026-04-29 — Per-assignee daily load on the Gantt (grouped-by-assignee)

The single-Task `computeTaskLoad` check catches a bar that's been
squeezed shorter than its estimate would justify, but it misses the
common case where two or three reasonably-sized Tasks for the same
person *overlap* on a few days and the combined load goes over
capacity. Each Task individually is fine; the assignee is still
overworked.

Added a per-day load aggregation that runs only when the Gantt is
grouped by assignee:

- `dailyLoadFor(items)` walks every leaf with both dates + a positive
  estimate, distributes the estimate evenly across the working days
  in its span (skipping Sat/Sun + holidays), and accumulates a
  `Map<dayNumber, points>` for the group.
- Days where `total / IDEAL_POINTS_PER_DAY > 1.0` get a red wash on
  the assignee's group-row timeline cell, a red 2px top border, and a
  hover tooltip with the exact load + overload ratio
  (`"Maya Chen: 6.3 pts on 2026-04-29 (1.6× ideal)"`).
- The group label gets a small red `⚠ N` chip showing how many days
  are over capacity, so the user can spot overworked assignees from
  the label column without scanning the timeline.

Why only when grouped by assignee: that's when the group's items are
the assignee's full slate, so summing them gives the right number. In
other groupings (project, type, etc.) the same aggregation would mix
people together and not mean anything useful.

Demo data: added ATL-119 ("Tile prefetch corrupts cache index"),
urgent fire-drill Bug for Maya Chen, Apr 29-30, est 6. Combined with
ATL-118 (Apr 26-30, est 5) and ATL-131 (Apr 29-30, est 4) — all
already assigned to Maya — she now hits ~6.25 pts/day on Apr 29 and
Apr 30. Switch to Gantt + group by assignee on Atlas's project list
or All Issues to see the two-day overload light up under "Maya Chen."

## 2026-04-29 — List and Gantt have independent groupings; Gantt drops status / priority / type

Two changes that conceptually belong together — the List and Gantt
views aren't really the same surface and shouldn't share toolbar
state.

1. **Independent groupBy per view.** `IssuesTable` now keeps two
   slots — `groupByList` and `groupByGantt`. The active value is
   whichever matches the current view; `setGroupBy` routes to the
   correct slot. Persisted state stores both. Switching List ↔ Gantt
   restores whatever was last picked on that side.

2. **Status / priority / type are not offered as Gantt groupings.**
   The Gantt picker is filtered to `none`, `project`, and `assignee`
   (plus whatever the consumer's `groupOptions` still allows after
   that filter). A Gantt is time-shaped — those keys aren't, and the
   same Task would jump groups as its status / priority / type
   changed, which produces a disorienting layout.

Defaults:
- List view default = the consumer's `defaultGroup` as before.
- Gantt view default = the consumer's `defaultGroup` if it's still
  allowed; otherwise `pickGanttDefault` falls back to
  `project → assignee → none` in that order.

Defensive: if a persisted `groupByGantt` is a now-forbidden value
(e.g. saved before this rule existed), we ignore it on load and use
the Gantt default instead.

## 2026-04-29 — Squeezed bars are allowed but flagged as overworked

Effort (`Issue.estimate`) and schedule (`startDate` / `endDate`) on a
Task are kept **independent** — the planner can drag the Gantt bar
shorter than the ideal duration. We deliberately don't auto-snap the
bar to `estimate / IDEAL_POINTS_PER_DAY` working days because real
planning often involves trade-offs (compress to hit a deadline, stretch
when there's slack), and forcing one variable to drive the other would
just feel like a fight.

What we DO: surface the cost of the squeeze.

- New helper `computeTaskLoad(estimate, start, end)` in `fixtures.ts`
  returns `{ estimate, workingDays, pointsPerDay, overload }` where
  `overload = pointsPerDay / IDEAL_POINTS_PER_DAY`. Returns `null`
  when the inputs are incomplete or the span lands entirely on
  non-working days.
- Threshold is `overload > 1.0` (a tiny epsilon to ignore float fuzz).
- Gantt: an over-capacity bar renders with a diagonal stripe in the
  blocked colour, a red border, an alert icon, and a tooltip line that
  spells out "12 pts over 1 working day → 12 pts/day (3× ideal load —
  overworked)".
- Inspector: directly under the Effort meta, a callout in the
  blocked colour reads "Overworked: 12 pts/day across 1 working day
  (3× the 4/day ideal). Lengthen the bar on the Gantt to bring the
  load down." When the schedule is within ideal, a quieter line just
  reports the per-day load for context.

This is a v1 view; "what's the team's aggregate load this week"
across all assignees is a future capacity surface, not built yet.

## 2026-04-29 — Working week is Mon-Fri; holidays via `HOLIDAYS` set

Two related policy decisions for capacity / scheduling math:

1. **Working week is Mon-Fri.** Sat/Sun are non-working — they don't
   count toward effort capacity or working-day spans. Captured as
   `WORKING_WEEKDAYS = {1,2,3,4,5}` (UTC weekday indexes) and
   `WORKING_DAYS_PER_WEEK = 5`.
2. **Holidays are first-class.** A `HOLIDAYS: ReadonlySet<string>` of
   ISO `YYYY-MM-DD` strings sits next to the working-week constants;
   anything in it is non-working. Seeded with `['2026-05-01']` (Labour
   Day). Single tenant-agnostic list for v1; per-tenant / per-region
   calendars are deferred.

Why both at once: the velocity math (`IDEAL_POINTS_PER_DAY = 4`) is
only useful if "day" means "working day." Picking the working-week
shape and the holiday list together avoids two separate cleanups.

Helpers (`fixtures.ts`): `isWorkingDay(iso)`, `isWorkingDate(date)`,
`workingDaysBetween(start, end)`, `addWorkingDays(iso, n)` — all
respect both rules.

UI: the inspector hint reads "≈ N working days at 4/day". The Gantt
backdrop shades weekends with the neutral subtle surface and holidays
with a faint warm wash; the day-strip header shows the holiday name as
a hover tooltip and tints the date number with the blocked color.

Demo data: the Atlas compaction Tasks were rescheduled so none start
or end on Sat/Sun or May 1. ATL-132 starts Mon May 4 instead of Fri
May 1; downstream Tasks (ATL-133 through ATL-136) cascade forward
to keep predecessor → successor order intact.

## 2026-04-29 — Effort estimates mandatory on Tasks; ideal velocity = 4 pts/day

`Issue.estimate` was always on the type but never enforced. Promoted to
**required on Tasks** because Tasks are the unit of scheduled work and
the Gantt / capacity surfaces need a number to plan against. Bugs keep
estimate as optional context. Stories and Epics don't show an effort
field at all — they roll up from descendant leaves, and a separate
estimate on the container would just drift from the underlying work.

Velocity assumption: **`IDEAL_POINTS_PER_DAY = 4`** — one assignee
delivers ~4 points of effort per working day. Single project-agnostic
constant for v1; per-team / per-assignee tuning deferred. The inspector
renders "≈ N days at 4/day" alongside the value so the calendar
implication is visible at a glance.

UI: a Task with no estimate shows a "Required — set effort" prompt in
the same red as Story-without-parent. A Bug with no estimate shows a
softer "Set effort" affordance. Inline edit: click the value (or the
prompt) → number input, commit on blur or Enter, cancel on Escape.

Also: the Gantt's "No schedule" badge is now leaf-only. Stories/Epics
without a dated descendant render a blank slot rather than a "missing
field" cue, since the user can't fix it from there anyway. Issue id is
the clickable link in the label column; the title is plain text.

## 2026-04-29 — `depends on` link added (Task-only, must be a DAG)

A second link type joins `relates` in v1: **`depends on`**. Semantics:
Task A *depends on* Task B → A cannot start until B has ended. A Task
can depend on multiple Tasks; the graph must stay a DAG.

Why now (despite "no link types beyond `relates` in v1" being a prior
constraint): scheduling is the load-bearing missing piece for the
Gantt to be useful. Generic `relates` doesn't carry directionality;
generic `blocks` doesn't carry the "before/after in time" semantics
the Gantt actually needs. `depends on` is the minimum addition that
makes the planner work, so it's promoted from "deferred" to "v1".

Mechanics:
- Type-restricted to Tasks only — Stories/Epics don't have their own
  schedules in v1, so depends-on between containers would be
  meaningless.
- Storage is symmetric: `dependsOn[]` (predecessors) and
  `dependedOnBy[]` (successors). Both sides must stay in sync, same
  rule as parent/children and relatedTo.
- DAG enforcement lives at the picker. `dependsOnWouldCycle(from, to,
  graph)` does a DFS through `to`'s transitive predecessors looking
  for `from`; the picker filter removes any candidate that would close
  a cycle, so the user can never commit one.
- Inspector for Tasks shows two Metas: editable "Depends on" with
  add/remove, and read-only "Blocks" (mirror of `dependedOnBy`) when
  other Tasks depend on this one.

What's still deferred: visualising dependency arrows on the Gantt,
clamping a Task's start when its predecessors slip, and a transition
rule like "blocked by predecessor still open." All possible follow-ups;
none are required for the link itself to be useful.

## 2026-04-29 — Schedules live on leaves; Stories/Epics derive their span

Tasks and Bugs are now the only issue types with `startDate` / `endDate`.
Stories and Epics no longer carry their own dates — their bar on the
Gantt is computed at view time as the union of descendant Task/Bug
dates and is read-only there.

Why: containers (Stories, Epics) shouldn't double-store a schedule
that's really determined by the leaves underneath them — it always
drifts. Making leaves the single source of truth and rolling up keeps
the data in sync without a sync mechanism. Containers that have no
dated leaves render as "No schedule" instead of a stale window.

Mechanics: on the Gantt, Task/Bug bars are draggable (move + resize +
click-drag-to-create). Story/Epic bars render in muted gray with no
drag handlers; they refresh automatically when a descendant leaf's
dates change. Inspector date editors are hidden for `type === 'S' |
'E'`.

## 2026-04-29 — Hierarchy hardened: Epics top-level, Stories require an Epic

The hierarchy rules in `product.md` and `v1-constraints.md` already
said *Epics have no parent* and *Stories' parent must be an Epic*, but
the prototype's UI and fixtures were lax — Epics had no parent surface
(good) but Stories could be created without a parent (bad), and
several seed Stories had no Epic.

Tightened to match the rules:
- Inspector hides the Parent meta entirely for `type === 'E'` (already
  the case; this is now also enforced explicitly in the rules doc).
- For `type === 'S'`, the Parent meta label changes to "Parent
  (required)", the clear (×) button is hidden, and an unset parent
  shows a "Pick an Epic — Stories must roll up to one" prompt instead
  of generic "Not set".
- All seed Stories in `fixtures.ts` now have an Epic parent and are
  mirrored in the Epic's `children[]`.

Why: containers without a roll-up target are dead weight — Stories
that aren't under an Epic don't show up in any planning surface, which
defeats the purpose of having them.

## 2026-04-29 — All Issues / My Issues persist toolbar state

Previously `groupBy`, filters, level, sort stack, and Gantt granularity
were re-defaulted every time the user navigated away from the workspace
issue lists. Now persisted to `localStorage` per
`bira:issues-state:<tenant>:<workspace>:<persistKey>` and re-hydrated
on mount. Unlocked filters are persisted; locked filters (e.g. "Me" on
My Issues) always come from `initialFilters` so page semantics survive
even if the persisted blob is stale.

A "Reset view" button appears in the toolbar whenever state diverges
from defaults; clicking it clears the blob and restores defaults
(plus any locked filters from `initialFilters`).

Why: the user reported losing context every time they bounced from a
filtered view to an issue and back. Caching is purely local (no server
involved), and a reset escape hatch covers the case where saved state
becomes confusing.

## 2026-04-27 — Issue hierarchy clarified

**Decision.** Clarified the issue hierarchy:

- Epic → Story → Task/Bug
- Epic → Task/Bug (Tasks and Bugs can sit directly under an Epic)
- Story → Task/Bug only (no nested stories, no epic-of-epic)
- Task/Bug are always leaves

---

## 2026-05-05 — Themes removed entirely

**Decision.** Themes (the orthogonal grouping entity introduced on
2026-04-27) are removed from BIRA. No `Theme` entity, no
`Issue.themes` field, no themes table, no themes API, no theme chip
in the issue inspector. The concept does not exist in v1.

**Why.** The cross-cutting "long-running concerns" use case it was
designed for did not survive review — labels, epics, and saved
filters cover it for the small/mid teams BIRA targets, and a separate
top-level entity is more cognitive load than the value justifies.
Better to ship a smaller surface and add grouping later if real users
ask for it.

**Tradeoff.** Anything previously expressed as a theme in fixtures is
gone — issues that carried `themes: ['THM-...']` no longer carry
anything in that slot. If grouping comes back, it will be designed
fresh against actual usage rather than restored from this aborted
shape.

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
