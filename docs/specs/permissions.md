# RBAC role matrix — spec

Status: **landed, baseline 2026-05-08.** Captures the BIRA v1 access
model end-to-end so a reader can answer "can role X do action Y?" by
skimming a table instead of reading route handlers.

For the load-bearing rules — role ladder, three-roles invariant,
admin-not-via-team, etc. — see
[`../../.claude/rules/v1-constraints.md`](../../.claude/rules/v1-constraints.md).
For the *why* behind the open-question decisions baked into this matrix
(self-leave scope, demotion semantics, archive policy, …) see the
decision-log entry dated `2026-05-08` in
[`../decisions.md`](../decisions.md).

---

## Overview

BIRA's authorisation has two moving parts: the **role ladder**
(`read < write < admin`) and the **scope** at which the role is
checked. Three roles, four scopes:

- **Tenant** scope. Stored in `tenant_memberships.role`. Tenant admins
  own workspace creation, member admin, password reset, deactivation,
  and reactivation.
- **Workspace** scope. Stored in `workspace_memberships.role`, but the
  *effective* role for a request is computed by
  `resolveEffectiveWorkspaceRole` (see below) — a tenant admin always
  resolves to `admin` here even without an explicit row.
- **Project** scope. Two tables — `project_user_access` (full ladder)
  and `project_team_access` (`write` / `read` only — admin is never
  inherited via a team). Read-time roll-up via
  `computeEffectiveMembers` produces a per-user `provenance` of
  `explicit-user > tenant-admin > workspace-admin > team`.
- **Team** scope. Teams have **no role of their own** — they are a
  carrier for project grants. Team membership only matters when the
  team itself has a row in `project_team_access`.

The cross-cutting rule is **explicit-over-inherited**: an explicit
grant at a narrower scope wins over a broader implicit grant, in
either direction (including downgrades). This is what lets a tenant
admin demote themselves on a single workspace, or grant a project
contributor `write` without giving them workspace `write`.

---

## Resolver semantics

### Tenant role

Read directly from `tenant_memberships`. The membership must exist and
have `status = 'active'`; an `invited` or `deactivated` row resolves
to **no access** at the tenant scope.
Source: `membershipService.getTenantMembership` and
`resolveTenantScope` in
[`server/src/middleware/tenantScope.ts`](../../server/src/middleware/tenantScope.ts).

### Workspace effective role (tenant-admin-wins)

`resolveEffectiveWorkspaceRole(userId, workspaceId, tenantId)` in
[`server/src/services/membershipService.ts`](../../server/src/services/membershipService.ts)
returns the first non-null branch:

1. No active tenant membership → **null** (403 at the route).
2. Tenant role is `admin` → **`admin`** at the workspace, no
   explicit workspace row needed.
3. Active row in `workspace_memberships` → that row's role
   (`admin | write | read`).
4. **Project-derived implicit `read`** — any active row in
   `project_user_access` for this user, OR membership in any team
   that has a row in `project_team_access` for a project in this
   workspace. Lets a project-only contributor navigate the workspace
   shell without being granted workspace `write`.
5. Otherwise → null.

The workspace scope middleware writes the resolved role to
`req.scope.role`, which `authorize('write' | 'admin')` then checks
against the ladder.

### Project effective role

`computeEffectiveMembers(projectId, workspaceId, tenantId)` in
[`server/src/services/projectAccessService.ts`](../../server/src/services/projectAccessService.ts)
collapses four branches per user (highest-precedence wins):

1. **`explicit-user`** — a row in `project_user_access`. Wins outright,
   at whatever role the row carries (`admin | write | read`).
2. **`tenant-admin`** — implicit `admin` coverage from a tenant-admin
   row. Surfaces the user as an effective admin on every project in
   the tenant, even without a workspace row.
3. **`workspace-admin`** — implicit `admin` coverage from an
   *explicit* workspace-admin row.
4. **`team`** — union of all `project_team_access` rows for teams the
   user belongs to. Highest of `write` / `read` wins; admin is
   excluded both at the route Zod schema and at the
   `project_team_access_role_chk` DB CHECK.

Project access is consumed by the
`/access/effective-members` endpoint and (transitively) by the
workspace-scope resolver's branch 4.

### Team role

Teams have no role of their own. `team_memberships` carries
`(team_id, user_id)` only. Adding a user to a team does not change
their workspace or project role; what changes is whether
`project_team_access` rows for that team apply to them.

---

## Auth and gate middleware (mount order)

Every authenticated request flows through this chain at
`/api/tenants/*`:

1. `authenticate` — sets `req.user` and `req.auth.method`
   (`'jwt' | 'pat'`). Mounted on the tenants router after the public
   `GET /api/tenants` listing.
2. `requirePasswordResetCleared` — 423 with code
   `PASSWORD_RESET_REQUIRED` when `req.user.mustResetPassword` is set.
   Same mount as `authenticate`. The only path that clears the flag
   is `POST /api/auth/change-password`, which is mounted on a
   different router and intentionally does not gate locked users.
3. `resolveTenantScope` — sets `req.scope = { tenantId, tenantSlug,
   tenantRole, tenantStatus, role }`. 404 on bogus slug, 403 with no
   active tenant membership.
4. `resolveWorkspaceScope` — adds `workspaceId, workspaceSlug,
   workspaceStatus`, recomputes `role` via
   `resolveEffectiveWorkspaceRole`. 404 on bogus slug, 403 with no
   effective role.
5. `authorize('read' | 'write' | 'admin')` — gates the handler on the
   ladder via `roleAtLeast(req.scope.role, required)`. 403 otherwise.
6. `requireActiveTenant` / `requireActiveWorkspace` /
   `requireActiveProject` — 409 on writes to a frozen scope. Mounted
   on mutation handlers only; reads bypass.
7. `requireJwtAuth` — 403 with code `PAT_CANNOT_MINT_PAT` when the
   request was authed via a PAT. Mounted only on `POST
   /api/auth/tokens` and `DELETE /api/auth/tokens/:id`.

`req.scope.role` after `resolveWorkspaceScope` is the **workspace**
effective role — not the tenant role. Endpoints that need to gate on
the **tenant** role (workspace archive / unarchive) check
`req.scope.tenantRole` directly instead of using `authorize()`.

---

## Decisions baked into the matrix (slice 2 call-outs)

These are the slice-2 decisions whose outcome is reflected in the
matrix rows below. Full prose is in `decisions.md` dated
`2026-05-08`.

- **Q1 — Workspace last-admin invariant: implicit tenant-admin
  fallback OK.** A workspace with one explicit admin and one tenant
  admin in the same tenant can still demote / remove the explicit
  admin; the tenant admin counts as the implicit fallback. The guard
  is wired into `setUserActive`, `removeWorkspaceMember`, and the
  workspace `PATCH` role-change paths.
- **Q2 — Self-leave is workspace-and-tenant only.** `DELETE
  /api/tenants/:t/members/:userId` and `DELETE
  /api/tenants/:t/workspaces/:w/members/:membershipId` allow the
  caller's own userId as a target. **Project / team self-leave is
  not added in v1** — getting off a project or team requires an
  admin to revoke.
- **Q3 — Demotion does not touch explicit grants.** Demoting a
  workspace admin to `write` removes only the implicit admin
  pathway; existing `project_user_access` and `project_team_access`
  rows are untouched. Mirrors explicit-over-inherited.
- **Q4 — Tenant admins surface where admin-relevance > opt-in
  concern.** Show as implicit on workspace settings → Members,
  project Members (via `tenant-admin` provenance), and effective-
  members views. Hide from team-detail "Add member" picker, the New
  project modal's people picker, and the issue assignee picker.
- **Q5 — `updateUserAccess` / `updateTeamAccess` already FE-wired.**
  Project-members page in-row pickers proxy the BE update endpoints;
  delete-and-re-grant is no longer the only path. No matrix gap.
- **Q6 — Team-grant default role is `read`.** `project_team_access`
  rejects `admin` at the route Zod and DB CHECK. Both the New project
  modal and the project-members "Add team" modal default to `read` —
  fail-loud bias (a team that should have been `write` produces a
  friction signal; one that should have been `read` is silent
  over-access).
- **Q7 — Reactivation restores grants as-is.** `POST
  /api/tenants/:t/members/:userId/reactivate` flips `is_active` back
  to `true` and leaves every dependent grant untouched. Workspace
  memberships, team memberships, and project user-access rows
  preserved across deactivate are still there on reactivate.
- **Q8 — Workspace archive is soft-freeze.** Mutations under an
  archived workspace 409 via `requireActiveWorkspace`; reads
  continue. Unarchive flips `workspaces.status` back to `active` —
  no other side-effects. Every grant, member, project, issue,
  comment, and file is byte-identical post-unarchive.

---

## Matrix — Tenant scope

Routes mounted under `/api/tenants/...`. Auth chain assumed unless
"Extra gate" says otherwise: `authenticate` →
`requirePasswordResetCleared` → `resolveTenantScope` (where
applicable).

| Action | Endpoint | Min role | Role scope | Extra gate | Tests |
|---|---|---|---|---|---|
| List active tenants (pre-login picker) | `GET /api/tenants` | none | — | public; deactivated tenants excluded | `server/tests/tenants/listTenants.test.ts` |
| Create tenant | `POST /api/tenants` | authenticated | — | caller granted `admin` on the new tenant in the same txn; password-reset gate applies | `server/tests/tenants/createTenant.test.ts` |
| Get tenant detail | `GET /api/tenants/:t` | tenant `read` | tenant | reachable on `deactivated` tenants for admin self-recovery | `server/tests/tenants/getTenant.test.ts` |
| Patch tenant display fields | `PATCH /api/tenants/:t` | tenant `admin` | tenant | `requireActiveTenant`; slug + plan immutable | (no dedicated test; `updateTenant` covered via `tenants/updateTenant.test.ts`) |
| Deactivate tenant | `POST /api/tenants/:t/deactivate` | tenant `admin` | tenant | (none — already-deactivated is idempotent) | `server/tests/tenants/deactivateTenant.test.ts`, `server/tests/tenants/deactivatedGate.test.ts` |
| Reactivate tenant | `POST /api/tenants/:t/reactivate` | tenant `admin` | tenant | **no `requireActiveTenant`** — only escape hatch out of `deactivated` | `server/tests/tenants/reactivateTenant.test.ts` |
| List tenant members | `GET /api/tenants/:t/members` | tenant `read` | tenant | — | `server/tests/tenantMembers/listMembers.test.ts` |
| Add tenant member | `POST /api/tenants/:t/members` | tenant `admin` | tenant | `requireActiveTenant`; target must already be a registered user; idempotent on active rows | `server/tests/tenantMembers/addMember.test.ts` |
| Get tenant member | `GET /api/tenants/:t/members/:userId` | tenant `read` | tenant | `requireActiveTenant` | (covered indirectly by `tenantMembers/listMembers.test.ts`) |
| Update tenant member role | `PATCH /api/tenants/:t/members/:userId` | tenant `admin` | tenant | `requireActiveTenant`; **last-admin guard** refuses demoting the only active admin (409) | `server/tests/tenantMembers/updateMemberRole.test.ts` |
| Remove tenant member (or self-leave) | `DELETE /api/tenants/:t/members/:userId` | tenant `admin` **OR** self | tenant | `requireActiveTenant`; usecase enforces `(caller, target)` split; **last-admin guard** (409); cascades to `workspace_memberships`, `team_memberships`, `project_user_access` in same txn | `server/tests/tenantMembers/removeMember.test.ts` |
| Admin reset password | `POST /api/tenants/:t/members/:userId/reset-password` | tenant `admin` | tenant | `requireActiveTenant`; self-target → 400; sets `mustResetPassword=true`; plaintext returned **once** | `server/tests/admin/resetPassword.test.ts` |
| Deactivate user (global) | `POST /api/tenants/:t/members/:userId/deactivate` | tenant `admin` | tenant | `requireActiveTenant`; self-target → 400; **workspace last-admin invariant** (409) names stranded workspace slugs | `server/tests/admin/deactivateUser.test.ts` |
| Reactivate user (global) | `POST /api/tenants/:t/members/:userId/reactivate` | tenant `admin` | tenant | `requireActiveTenant`; restores prior grants byte-identically (Q7) | `server/tests/admin/deactivateUser.test.ts` |

---

## Matrix — Workspace scope

Routes mounted under `/api/tenants/:t/workspaces/...`. Auth chain
adds `resolveWorkspaceScope`. `req.scope.role` is the **effective**
workspace role (tenant-admin-wins).

| Action | Endpoint | Min role | Role scope | Extra gate | Tests |
|---|---|---|---|---|---|
| List workspaces in tenant | `GET /api/tenants/:t/workspaces?includeArchived=true` | tenant `read` | tenant | listing scoped to caller's effective workspace access; archived hidden by default | `server/tests/workspaces/listWorkspaces.test.ts` |
| Create workspace | `POST /api/tenants/:t/workspaces` | tenant `admin` | tenant | `requireActiveTenant` | `server/tests/workspaces/createWorkspace.test.ts` |
| Get workspace detail | `GET /api/tenants/:t/workspaces/:w?includeArchived=true` | workspace `read` | workspace | archived 404s without `?includeArchived=true` (fails-fast stale FE bookmarks) | `server/tests/workspaces/getWorkspace.test.ts` |
| Patch workspace display fields | `PATCH /api/tenants/:t/workspaces/:w` | workspace `admin` (tenant-admin-wins) | workspace | `requireActiveTenant`; slug immutable | `server/tests/workspaces/updateWorkspace.test.ts` |
| Archive workspace | `POST /api/tenants/:t/workspaces/:w/archive` | tenant `admin` | tenant (checked via `req.scope.tenantRole`) | `requireActiveTenant`; **not** `authorize('admin')` — workspace admins explicitly cannot archive | `server/tests/workspaces/archiveWorkspace.test.ts` |
| Unarchive workspace | `POST /api/tenants/:t/workspaces/:w/unarchive` | tenant `admin` | tenant (checked via `req.scope.tenantRole`) | `requireActiveTenant`; mirror of archive | `server/tests/workspaces/unarchiveWorkspace.test.ts` |
| List workspace members | `GET /api/tenants/:t/workspaces/:w/members` | workspace `read` | workspace | implicit tenant admins surface in the list (Q4 show) | `server/tests/workspaceMembers/listMembers.test.ts` |
| Add workspace member | `POST /api/tenants/:t/workspaces/:w/members` | workspace `admin` | workspace | `requireActiveTenant` + `requireActiveWorkspace`; target must be active tenant member (400); duplicate (409) | `server/tests/workspaceMembers/addMember.test.ts` |
| Update workspace member role | `PATCH /api/tenants/:t/workspaces/:w/members/:membershipId` | workspace `admin` | workspace | `requireActiveTenant` + `requireActiveWorkspace`; **last-admin guard** counts active tenant admins as implicit (Q1) | `server/tests/workspaceMembers/updateMemberRole.test.ts` |
| Remove workspace member (or self-leave) | `DELETE /api/tenants/:t/workspaces/:w/members/:membershipId` | workspace `admin` **OR** self | workspace | `requireActiveTenant` + `requireActiveWorkspace`; usecase enforces `(caller, target)` split; **last-admin guard** (Q1); cascades to `team_memberships`, `project_user_access` in same txn | `server/tests/workspaceMembers/removeMember.test.ts` |
| List teams | `GET /api/tenants/:t/workspaces/:w/teams` | workspace `read` | workspace | — | `server/tests/teams/teamCrud.test.ts` |
| Create team | `POST /api/tenants/:t/workspaces/:w/teams` | workspace `admin` | workspace | `requireActiveTenant` + `requireActiveWorkspace` | `server/tests/teams/teamCrud.test.ts` |
| Get team | `GET /api/tenants/:t/workspaces/:w/teams/:teamSlug` | workspace `read` | workspace | — | `server/tests/teams/teamCrud.test.ts` |
| Patch team display fields | `PATCH /api/tenants/:t/workspaces/:w/teams/:teamSlug` | workspace `admin` | workspace | `requireActiveTenant` + `requireActiveWorkspace`; slug immutable | `server/tests/teams/teamCrud.test.ts` |
| Delete team | `DELETE /api/tenants/:t/workspaces/:w/teams/:teamSlug` | workspace `admin` | workspace | `requireActiveTenant` + `requireActiveWorkspace` | `server/tests/teams/teamCrud.test.ts` |
| List team members | `GET /api/tenants/:t/workspaces/:w/teams/:teamSlug/members` | workspace `read` | workspace | — | `server/tests/teams/teamCrud.test.ts` |
| Add team member | `POST /api/tenants/:t/workspaces/:w/teams/:teamSlug/members` | workspace `admin` | workspace | `requireActiveTenant` + `requireActiveWorkspace`; target must be active workspace member (400) | `server/tests/teams/teamCrud.test.ts` |
| Remove team member | `DELETE /api/tenants/:t/workspaces/:w/teams/:teamSlug/members/:userId` | workspace `admin` | workspace | `requireActiveTenant` + `requireActiveWorkspace`; **no self-leave** in v1 (Q2) | `server/tests/teams/teamCrud.test.ts` |
| List workflows | `GET /api/tenants/:t/workspaces/:w/workflows` | workspace `read` | workspace | — | `server/tests/workflows/workflowAuth.test.ts` |
| Create workflow | `POST /api/tenants/:t/workspaces/:w/workflows` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace` | `server/tests/workflows/workflowAuth.test.ts`, `workflowCrud.test.ts` |
| Get workflow | `GET /api/tenants/:t/workspaces/:w/workflows/:slug` | workspace `read` | workspace | — | `server/tests/workflows/workflowCrud.test.ts` |
| Patch workflow (full-replace nodes/transitions) | `PATCH /api/tenants/:t/workspaces/:w/workflows/:slug` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace` | `server/tests/workflows/workflowCrud.test.ts` |
| Delete workflow | `DELETE /api/tenants/:t/workspaces/:w/workflows/:slug` | workspace `admin` | workspace | `requireActiveTenant` + `requireActiveWorkspace` | `server/tests/workflows/workflowAuth.test.ts` |
| List workspace issues | `GET /api/tenants/:t/workspaces/:w/issues` | workspace `read` | workspace | accepts `projectId`, `status`, `type`, `assigneeUserId`, `teamId`, `label`, `priority` | `server/tests/issues/listIssues.test.ts` |
| List workspace milestones | `GET /api/tenants/:t/workspaces/:w/milestones` | workspace `read` | workspace | optional `?projectId=` filter | `server/tests/milestones/listMilestones.test.ts` |
| Search mentionables | `GET /api/tenants/:t/workspaces/:w/mentionables/search` | workspace `read` | workspace | `q` required (1-char min); `types`, `limit` optional | `server/tests/mentionables/search.test.ts` |
| Upload file | `POST /api/tenants/:t/workspaces/:w/files` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace`; multipart, 10 MB cap | `server/tests/files/upload.test.ts` |
| Download file (Bearer) | `GET /api/tenants/:t/workspaces/:w/files/:id` | workspace `read` | workspace | **no `requireActiveWorkspace`** — reads from archived workspaces are fine | `server/tests/files/download.test.ts` |
| Delete file | `DELETE /api/tenants/:t/workspaces/:w/files/:id` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace`; **uploader OR workspace `admin`** (usecase-level gate) | `server/tests/files/delete.test.ts` |
| Patch comment | `PATCH /api/tenants/:t/workspaces/:w/comments/:commentId` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace`; **author OR workspace `admin`** (usecase-level gate, 403 otherwise) | `server/tests/comments/update.test.ts` |
| Delete comment | `DELETE /api/tenants/:t/workspaces/:w/comments/:commentId` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace`; **author OR workspace `admin`** (usecase-level gate, 403 otherwise) | `server/tests/comments/delete.test.ts` |

---

## Matrix — Project scope

Routes mounted under `/api/tenants/:t/workspaces/:w/projects/...`.
Same auth chain as workspace scope; `req.scope.role` is still the
**workspace** effective role. Project routes do **not** consult
`computeEffectiveMembers` for the route-level gate — workspace
`write` / `admin` is sufficient. The project-effective view exists
for the `effective-members` reporting endpoint and any future
visibility narrowing (today everyone in the workspace sees every
project — see "What's NOT here yet" in `server/README.md`).

| Action | Endpoint | Min role | Role scope | Extra gate | Tests |
|---|---|---|---|---|---|
| List projects | `GET /api/tenants/:t/workspaces/:w/projects?includeArchived=true` | workspace `read` | workspace | archived hidden by default | `server/tests/projects/listProjects.test.ts` |
| Create project | `POST /api/tenants/:t/workspaces/:w/projects` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace` | `server/tests/projects/createProject.test.ts` |
| Get project | `GET /api/tenants/:t/workspaces/:w/projects/:p?includeArchived=true` | workspace `read` | workspace | archived 404s without `?includeArchived=true` | `server/tests/projects/getProject.test.ts` |
| Patch project display fields | `PATCH /api/tenants/:t/workspaces/:w/projects/:p` | workspace `admin` | workspace | `requireActiveTenant`; slug + key immutable; **no `requireActiveWorkspace`** so admins can rename frozen projects | `server/tests/projects/updateProject.test.ts` |
| Archive project | `POST /api/tenants/:t/workspaces/:w/projects/:p/archive` | workspace `admin` | workspace | `requireActiveTenant` | `server/tests/projects/archiveProject.test.ts` |
| Unarchive project | `POST /api/tenants/:t/workspaces/:w/projects/:p/unarchive` | workspace `admin` | workspace | `requireActiveTenant` | `server/tests/projects/archiveProject.test.ts` |
| Get project workflows map | `GET /api/tenants/:t/workspaces/:w/projects/:p/workflows` | workspace `read` | workspace | returns `{ T?, B?, S?, E? }` map | (no dedicated test; covered via `projects/createProject.test.ts` decorator path) |
| Set project workflow for issue type | `PUT /api/tenants/:t/workspaces/:w/projects/:p/workflows/:issueType` | workspace `write` | workspace | issue type must be `T \| B \| S \| E` | (no dedicated test — README "Known coverage gaps") |
| List project access | `GET /api/tenants/:t/workspaces/:w/projects/:p/access` | workspace `read` | workspace | — | `server/tests/projectAccess/grants.test.ts` |
| List effective members | `GET /api/tenants/:t/workspaces/:w/projects/:p/access/effective-members` | workspace `read` | workspace | rolls up via `computeEffectiveMembers` (provenance precedence: `explicit-user > tenant-admin > workspace-admin > team`) | `server/tests/projectAccess/grants.test.ts` |
| Add project team grant | `POST /api/tenants/:t/workspaces/:w/projects/:p/access/teams` | workspace `admin` | workspace | `requireActiveTenant` + `requireActiveWorkspace`; **`admin` role rejected** at Zod and DB CHECK; default `read` (Q6) | `server/tests/projectAccess/grants.test.ts` |
| Update project team grant | `PATCH /api/tenants/:t/workspaces/:w/projects/:p/access/teams/:teamId` | workspace `admin` | workspace | `requireActiveTenant` + `requireActiveWorkspace`; admin rejected | `server/tests/projectAccess/grants.test.ts` |
| Remove project team grant | `DELETE /api/tenants/:t/workspaces/:w/projects/:p/access/teams/:teamId` | workspace `admin` | workspace | `requireActiveTenant` + `requireActiveWorkspace` | `server/tests/projectAccess/grants.test.ts` |
| Add project user grant | `POST /api/tenants/:t/workspaces/:w/projects/:p/access/users` | workspace `admin` | workspace | `requireActiveTenant` + `requireActiveWorkspace`; full ladder allowed (`admin \| write \| read`) | `server/tests/projectAccess/grants.test.ts` |
| Update project user grant | `PATCH /api/tenants/:t/workspaces/:w/projects/:p/access/users/:userId` | workspace `admin` | workspace | `requireActiveTenant` + `requireActiveWorkspace`; explicit grant survives demotion of user's workspace role (Q3) | `server/tests/projectAccess/grants.test.ts` |
| Remove project user grant | `DELETE /api/tenants/:t/workspaces/:w/projects/:p/access/users/:userId` | workspace `admin` | workspace | `requireActiveTenant` + `requireActiveWorkspace`; **no self-leave** in v1 (Q2) | `server/tests/projectAccess/grants.test.ts` |
| List project issues | `GET /api/tenants/:t/workspaces/:w/projects/:p/issues` | workspace `read` | workspace | filters: `status`, `type`, `assigneeUserId`, `teamId`, `label`, `priority` | `server/tests/issues/listIssues.test.ts` |
| Create issue | `POST /api/tenants/:t/workspaces/:w/projects/:p/issues` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace` + project active (in-route 409); team-on-issue mutex; reporter = caller | `server/tests/issues/createIssue.test.ts` |
| Get issue | `GET /api/tenants/:t/workspaces/:w/projects/:p/issues/:key` | workspace `read` | workspace | — | `server/tests/issues/getIssue.test.ts` |
| Patch issue | `PATCH /api/tenants/:t/workspaces/:w/projects/:p/issues/:key` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace` + project active; status changes pass through `evaluateTransition` (workflow guard, 403 on deny) | `server/tests/issues/updateIssue.test.ts` |
| Set issue parent | `PATCH /api/tenants/:t/workspaces/:w/projects/:p/issues/:key/parent` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace` + project active; hierarchy rules; cycle rejection | `server/tests/issues/setIssueParent.test.ts` |
| Add `relates` link | `POST /api/tenants/:t/workspaces/:w/projects/:p/issues/:key/relates` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace` + project active; symmetric, every type | `server/tests/issueLinks/relatesAuth.test.ts`, `links.test.ts` |
| Remove `relates` link | `DELETE /api/tenants/:t/workspaces/:w/projects/:p/issues/:key/relates/:relatedKey` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace` + project active | `server/tests/issueLinks/relatesAuth.test.ts`, `links.test.ts` |
| Add dependency | `POST /api/tenants/:t/workspaces/:w/projects/:p/issues/:key/dependencies` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace` + project active; **Task-only**; cycle rejected at usecase | `server/tests/issueLinks/dependenciesAuth.test.ts`, `links.test.ts` |
| Remove dependency | `DELETE /api/tenants/:t/workspaces/:w/projects/:p/issues/:key/dependencies/:blockerKey` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace` + project active | `server/tests/issueLinks/dependenciesAuth.test.ts`, `links.test.ts` |
| List comments on issue | `GET /api/tenants/:t/workspaces/:w/projects/:p/issues/:key/comments` | workspace `read` | workspace | — | `server/tests/comments/list.test.ts` |
| Create comment on issue | `POST /api/tenants/:t/workspaces/:w/projects/:p/issues/:key/comments` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace` + project active | `server/tests/comments/create.test.ts` |
| List project milestones | `GET /api/tenants/:t/workspaces/:w/projects/:p/milestones` | workspace `read` | workspace | — | `server/tests/milestones/listMilestones.test.ts` |
| Create milestone | `POST /api/tenants/:t/workspaces/:w/projects/:p/milestones` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace` + project active | `server/tests/milestones/createMilestone.test.ts` |
| Get milestone | `GET /api/tenants/:t/workspaces/:w/projects/:p/milestones/:id` | workspace `read` | workspace | cross-project id → 404 | `server/tests/milestones/getMilestone.test.ts` |
| Patch milestone | `PATCH /api/tenants/:t/workspaces/:w/projects/:p/milestones/:id` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace` + project active; cross-project → 404 | `server/tests/milestones/updateMilestone.test.ts` |
| Delete milestone | `DELETE /api/tenants/:t/workspaces/:w/projects/:p/milestones/:id` | workspace `write` | workspace | `requireActiveTenant` + `requireActiveWorkspace` + project active; cross-project → 404 | `server/tests/milestones/deleteMilestone.test.ts` |

---

## Matrix — Auth and self-service

Routes mounted under `/api/auth/...`. These do **not** flow through
the tenant-scope middleware. The password-reset gate is mounted on
`/api/tenants/*` only — `/api/auth/*` stays reachable for a locked
user so they can self-rotate.

| Action | Endpoint | Min role | Role scope | Extra gate | Tests |
|---|---|---|---|---|---|
| Register | `POST /api/auth/register` | none | — | public | `server/tests/auth/register.test.ts` |
| Login | `POST /api/auth/login` | none | — | public; deactivated user → 401 | `server/tests/auth/login.test.ts` |
| Refresh token | `POST /api/auth/refresh-token` | none | — | public; refresh token in body | `server/tests/auth/refreshToken.test.ts` |
| Get profile | `GET /api/auth/profile` | authenticated | — | locked users allowed (only way to discover the locked state) | `server/tests/auth/profile.test.ts` |
| Patch profile | `PATCH /api/auth/me` | authenticated | — | locked users allowed; email collision → 409 | `server/tests/auth/updateProfile.test.ts` |
| Change own password | `POST /api/auth/change-password` | authenticated | — | locked users allowed (only path that clears `mustResetPassword`); wrong current → 401 | `server/tests/auth/changePassword.test.ts` |
| Create PAT | `POST /api/auth/tokens` | authenticated | — | **JWT-only** (`requireJwtAuth`, 403 `PAT_CANNOT_MINT_PAT`); ≤ 10 active per user (422 `PAT_LIMIT_REACHED`); plaintext returned **once** | `server/tests/personalAccessTokens/createToken.test.ts`, `patAuth.test.ts` |
| List own PATs | `GET /api/auth/tokens` | authenticated | — | PAT auth allowed (no plaintext in response); other users' tokens never visible | `server/tests/personalAccessTokens/listTokens.test.ts` |
| Revoke PAT | `DELETE /api/auth/tokens/:id` | authenticated | — | **JWT-only**; not-found / wrong-owner / already-revoked → 404 `PAT_NOT_FOUND` | `server/tests/personalAccessTokens/revokeToken.test.ts`, `patAuth.test.ts` |

---

## Matrix — Public, signature-authed

Routes mounted at the app root, **outside `/api/tenants`**. The HMAC
signature is the authorisation; nothing else gates these routes.
**Note:** these are not yet listed in the endpoint catalogue in
`server/README.md` — see "Discrepancies found" at the bottom.

| Action | Endpoint | Min role | Role scope | Extra gate | Tests |
|---|---|---|---|---|---|
| Healthcheck | `GET /healthcheck` | none | — | public | (no automated test) |
| Read file via signed URL | `GET /api/files/:id?sig=&exp=` | none | — | HMAC `sig` valid for `id`, `exp` not in past; `Cross-Origin-Resource-Policy: cross-origin` so `<img>` works across origins; bad sig / expired → 401 | (no automated test — gap) |

---

## Edge cases

### Self-leave + last-admin guard interaction

Self-leave is a usecase-level branch in `removeTenantMember` /
`removeWorkspaceMember`, not a separate endpoint. The
`(actingUserId === targetUserId)` check skips the admin requirement
but **does not** skip the last-admin guard — a sole admin trying to
walk away gets the same 409 a peer admin would get trying to remove
them. They have to promote someone else first. (Decision Q2 keeps
this surface workspace-and-tenant only; project / team self-leave is
deferred so no other code paths need this guard.)

### Cross-tenant enumeration posture

Lookups for rows that exist but belong to a different tenant return
**404**, not 403. This is the same posture
`server/README.md` describes for milestones, files, comments, and
team references — refusing with 403 would confirm the resource exists
and let an attacker enumerate. The same applies to anything addressed
by uuid: if your workspace can't reach it, the API treats it as
absent rather than forbidden. The exception is the auth chain itself
(`resolveTenantScope` returns 403 once a tenant *slug* resolves to a
real tenant the user isn't in, because the slug is part of the URL).

### JWT-only mutations on `/api/auth/tokens`

`POST /api/auth/tokens` and `DELETE /api/auth/tokens/:id` mount
`requireJwtAuth` after `authenticate`, so a leaked PAT cannot mint
or revoke other PATs even though `req.user` would otherwise resolve.
`GET /api/auth/tokens` is intentionally PAT-readable — an MCP agent
running under a PAT needs to introspect its own tokens (verify name /
last4 / expiresAt) without an interactive login. The list response
carries no plaintext, so PAT-authed reads don't broaden the leak
surface.

### Password-reset gate (423) preempts every `/api/tenants/*` route

`requirePasswordResetCleared` is mounted on the tenants router right
after `authenticate`, so any request under `/api/tenants/*` from a
locked user returns 423 with `code: 'PASSWORD_RESET_REQUIRED'`
*before* the tenant-scope, workspace-scope, or `authorize()` middleware
runs. The only way out is `POST /api/auth/change-password`, which is
on a different router that intentionally does not gate locked users.
PAT auth flows through this gate identically — a locked user's PATs
stop working until they self-rotate.

### Frozen-scope writes (409, mutation paths only)

Three soft-freeze gates produce HTTP 409, in increasing scope:

- **Project archived** — `requireActiveProject` (in-line check inside
  `projectIssues.ts` and `projectMilestones.ts`) blocks issue and
  milestone mutations. Reads + the project-level archive/unarchive/
  PATCH endpoints bypass.
- **Workspace archived** — `requireActiveWorkspace` blocks every
  workspace-scoped mutation handler. Workspace PATCH and the
  workspace-level archive/unarchive endpoints intentionally **do
  not** mount this middleware, so admins can manage a frozen
  workspace.
- **Tenant deactivated** — `requireActiveTenant` blocks every
  tenant-scoped mutation. The only escape hatch is
  `POST /api/tenants/:t/reactivate`, which deliberately omits the
  middleware.

A request hitting a write path on a frozen scope returns 409 with a
message naming the scope and the unfreeze action — never 403, so the
client knows the issue is lifecycle, not authorisation.

### Author-or-admin gates (comments, files)

Three endpoints carry a usecase-level "author OR admin" gate that
sits *under* the route-level `authorize('write')`:

- `PATCH /api/tenants/:t/workspaces/:w/comments/:commentId` — author
  or workspace `admin`.
- `DELETE /api/tenants/:t/workspaces/:w/comments/:commentId` — author
  or workspace `admin`.
- `DELETE /api/tenants/:t/workspaces/:w/files/:id` — uploader or
  workspace `admin`.

The route gate is `write`, not `read`, so the lower bound for *any*
caller is workspace `write`; inside the usecase, a non-author /
non-uploader without `admin` gets 403. This catches the case where a
rogue workspace `write` member tries to edit someone else's comment
or delete someone else's upload.

### Workflow guard on issue PATCH

`updateIssue` invokes `evaluateTransition` whenever the patch
includes `status` and acting-user context is supplied. Deny → 403
with the rule's reason. If the project's `(project, issueType)` pair
has no explicit workflow row and no slug-default fallback exists,
the guard returns `noWorkflow=true` and the update passes through —
the matrix still lists `workspace write` as the min role; the
workflow guard is an additional gate, not a substitute.

---

## Discrepancies found between `server/README.md` and code

Two items surfaced while writing this matrix; flagged so the next
update to either side can decide which way to move.

1. **Public signed-URL file read is undocumented in the endpoint
   catalogue.** `routes/publicFiles.ts` exposes
   `GET /api/files/:id?sig=&exp=` (mounted in `app.ts` outside
   `/api/tenants`), but the README's "Files" section only documents
   the workspace-scoped `POST/GET/DELETE`. The signed URL is
   load-bearing — `toFileView` returns a `readUrl` pointing at it,
   which means `<img src>` for description / comment attachments
   round-trips through this route. The README should grow a row in
   the Files table, or a separate "Public file reads" subsection.
2. **No automated tests cover the signed-URL route** (`/api/files/:id`).
   The README's "Known coverage gaps" doesn't list it. Worth filing
   under coverage gaps so signature verification, expiry, and the
   `Cross-Origin-Resource-Policy: cross-origin` header don't drift
   silently.

Neither was within scope to fix in this slice (doc-only) — flagged
for a follow-up README + test pass.

---

## Open follow-ups (post-v1, not in this matrix)

- **Granular roles** beyond `read | write | admin` — per-feature
  permissions, resource-level ACLs, custom role definitions. All
  out-of-scope per `.claude/rules/v1-constraints.md`.
- **Project / team self-leave** — Q2 deferred. Adding requires a
  "last edit-access holder" guard at four more code paths.
- **Project-narrowed visibility** — today everyone with workspace
  `read` sees every project's issues / comments; project access only
  governs the workspace-shell read-fallback (resolver branch 4) and
  the effective-members reporting endpoint. Tightening is a separate
  phase once the FE is wired.
- **System-level admin** — BIRA has no super-admin in v1. The
  "tenant admins manage their own tenant" rule is a deliberate
  ceiling.
- **Audit log** — separate phase. The matrix above is what *would*
  be audited; the storage + query side isn't built.
