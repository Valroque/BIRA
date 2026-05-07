# BIRA server

Node + TypeScript + Express + Knex + Postgres. Layering ported from
the ABHA project (sibling repo).

## Layout

```
server/
├── package.json          ESM, tsx for dev, tsc for prod
├── tsconfig.json         strict + NodeNext + ES2022
├── knexfile.ts           re-exports src/config/database.ts
├── docker-compose.yml    postgres:16-alpine on host port 5433
├── .env.development.example
├── scripts/{db-up.sh, db-reset.sh}
├── db/migrations/        Knex migrations (.ts files)
├── db/seeds/             Knex seeds (.ts files)
└── src/
    ├── app.ts                  bootstrap: helmet + cors + json + routes + errorHandler
    ├── config/database.ts      env-aware dotenv + knex config (knex-stringcase)
    ├── db/knex.ts              singleton client + disconnectDB
    ├── lib/
    │   ├── constants.ts        Role ladder, project status enums
    │   ├── errors.ts           EntityError / ServiceError / AppError
    │   └── passwordUtils.ts    bcrypt hash + compare
    ├── middleware/
    │   ├── auth.ts             authenticate + JWT helpers
    │   ├── errorHandler.ts     asyncHandler + global error normaliser (Zod, AppError, PG)
    │   ├── logger.ts           winston + request log
    │   └── tenantScope.ts      resolveTenantScope / resolveWorkspaceScope / authorize
    ├── routes/
    │   ├── auth.ts             /api/auth: register, login, refresh-token, profile
    │   ├── tenants.ts          /api/tenants and nested workspaces/projects routers
    │   ├── workspaces.ts       /api/tenants/:tenantSlug/workspaces
    │   ├── projects.ts         …/workspaces/:workspaceSlug/projects
    │   └── health.ts           /healthcheck
    ├── usecases/<domain>/<action>.ts   one file per action
    ├── services/<domain>Service.ts     thin Knex per table/domain
    ├── entities/<Entity>.ts            class with fromRow() + invariants
    └── types/express.d.ts              augments req.user, req.scope
```

## DB conventions

- Postgres columns are `snake_case`.
- App code reads/writes `camelCase`. The bridge is `knex-stringcase`,
  applied in `src/config/database.ts`.
- All ids are `uuid` with `gen_random_uuid()` defaults (pgcrypto).

## Error model

| Class          | Maps to | When to throw                                             |
|----------------|---------|-----------------------------------------------------------|
| `EntityError`  | 500     | Data integrity bug (caught at entity construction)        |
| `ServiceError` | varies  | Business rule violation; carries `statusCode`             |
| `AppError`     | varies  | Operational, client-facing, with explicit `statusCode`    |

Zod parse failures are auto-converted to 400 with a flat message.

## Auth

- Bcrypt + JWT (access + refresh, distinct secrets).
- Access tokens passed as `Authorization: Bearer <token>`.
- `authenticate` middleware sets `req.user: User`.
- `requirePasswordResetCleared` (mounted on `/api/tenants` after
  `authenticate`) returns HTTP 423 with `code: 'PASSWORD_RESET_REQUIRED'`
  when `req.user.mustResetPassword` is set. See "Password reset gate"
  below.
- `resolveTenantScope` (mounted on `/:tenantSlug` routers) sets
  `req.scope = { tenantId, tenantSlug, role }` after looking up
  `tenant_memberships`.
- `resolveWorkspaceScope` adds `workspaceId, workspaceSlug` and
  recomputes `role` using the tenant-admin-wins rule.
- `authorize(required: Role)` gates a handler on the ladder
  `read < write < admin`.
- `requireActiveWorkspace` rejects writes to a workspace whose status is
  `archived` (HTTP 409). Mount on any workspace-scoped mutation handler
  after `resolveWorkspaceScope`.
- `requireActiveTenant` rejects writes to a tenant whose status is
  `deactivated` (HTTP 409). Mount on any tenant-scoped mutation handler
  after `resolveTenantScope`. Intentionally NOT mounted on
  `POST /api/tenants/:t/reactivate` — that's the only escape hatch.

### User-facing auth endpoints

| Method | Path                              | Auth                               |
|--------|-----------------------------------|------------------------------------|
| POST   | `/api/auth/register`              | public                             |
| POST   | `/api/auth/login`                 | public                             |
| POST   | `/api/auth/refresh-token`         | public (refresh token in body)     |
| GET    | `/api/auth/profile`               | any authenticated user (incl. locked) |
| PATCH  | `/api/auth/me`                    | any authenticated user (incl. locked) |
| POST   | `/api/auth/change-password`       | any authenticated user (incl. locked) |

`PATCH /api/auth/me` accepts any subset of `{ firstName, lastName, email,
phone, avatar }` — at least one field is required. `phone` and `avatar`
accept `null` to clear. Email collisions return HTTP 409.

`POST /api/auth/change-password` takes `{ currentPassword, newPassword }`
(new must be ≥ 8 chars and differ from current). On success it clears
`mustResetPassword`. Wrong current password → 401. **This is the only
path that clears the locked flag** — re-logging in with a temp password
does NOT clear it.

### Password reset gate

Users carry a `mustResetPassword` boolean. When set, every authenticated
request under `/api/tenants/*` is blocked with:

```
HTTP/1.1 423 Locked
{ "success": false, "code": "PASSWORD_RESET_REQUIRED", "message": "..." }
```

Tenant admins reset another member's password via:

| Method | Path                                                              | Auth         |
|--------|-------------------------------------------------------------------|--------------|
| POST   | `/api/tenants/:t/members/:userId/reset-password`                  | tenant admin |

The server generates a 16-character temporary password from an
unambiguous alphabet, hashes it, persists it with `mustResetPassword:
true`, and returns the plaintext **exactly once** in the response:

```json
{ "success": true, "data": { "user": { ... }, "temporaryPassword": "..." } }
```

The plaintext is never written to logs (the route logs only `actingUserId`,
`targetUserId`, `tenantId`). The admin shares the temp password with the
target user out-of-band; the target user logs in with it (login still
succeeds), then MUST call `POST /api/auth/change-password` to clear the
flag before they can interact with any tenant data. This stops the
"admin shares temp pwd with the wrong recipient and the original user
never notices" attack path — the legitimate user MUST self-rotate.

Self-target on the admin endpoint → 400 (admins rotate their own password
via `/api/auth/change-password`). Resetting a user who isn't an active
member of the target tenant → 404.

### Tenant lifecycle

Tenants carry `status` (`active` | `deactivated`, default `active`).
Deactivation is a soft-freeze, not a delete — no rows are removed; the
tenant just stops appearing in `GET /api/tenants`. A deactivated tenant
can still be reached by slug at `GET /api/tenants/:t` (auth-gated) so
its admins can find it and reactivate.

| Method | Path                                              | Auth                       |
|--------|---------------------------------------------------|----------------------------|
| GET    | `/api/tenants`                                    | **public** (pre-login picker) |
| POST   | `/api/tenants`                                    | any authenticated user     |
| GET    | `/api/tenants/:t`                                 | tenant member              |
| POST   | `/api/tenants/:t/deactivate`                      | tenant admin               |
| POST   | `/api/tenants/:t/reactivate`                      | tenant admin               |

`GET /api/tenants` returns plain tenant rows (`{id, slug, name, letter,
color, bg, plan, status, createdAt, updatedAt}[]`) ordered by name.
Deactivated tenants are always excluded — there is no caller context to
authorise an opt-in surface.

`POST /api/tenants` takes `{ slug, name, letter, color, bg, plan? }`.
The caller is granted `admin` membership on the new tenant in the same
transaction. Slug must be globally unique (it's load-bearing in
`/:tenantSlug/...` URLs and FE localStorage keys).

### Workspace lifecycle

Workspaces carry `status` (`active` | `archived`, default `active`).
Archive is a soft-freeze, not a delete — no rows are removed; instead
mutation paths under the workspace (currently project create) refuse
the request via `requireActiveWorkspace` until the workspace is
unarchived.

| Method | Path                                                            | Auth                |
|--------|-----------------------------------------------------------------|---------------------|
| GET    | `/api/tenants/:t/workspaces?includeArchived=true`               | tenant member       |
| POST   | `/api/tenants/:t/workspaces`                                    | tenant admin        |
| GET    | `/api/tenants/:t/workspaces/:w?includeArchived=true`            | workspace member    |
| PATCH  | `/api/tenants/:t/workspaces/:w` (name/letter/color/bg)          | workspace admin     |
| POST   | `/api/tenants/:t/workspaces/:w/archive`                         | tenant admin        |
| POST   | `/api/tenants/:t/workspaces/:w/unarchive`                       | tenant admin        |

Slug is intentionally immutable — it's load-bearing in URLs and FE
localStorage keys; renaming is a separate migration story.

### Project lifecycle

Projects carry `status` (`active` | `archived`, default `active`).
Mirrors workspace archive but at the project scope — workspace admins
can freeze a single project without involving tenant admin. Archive
blocks all issue mutations under the project (create, update, parent,
links, comments) with HTTP 409 via `requireActiveProject` in the
issue routes; reads continue to work via `?includeArchived=true`. PATCH
and archive/unarchive themselves bypass the gate so admins can manage a
frozen project.

| Method | Path                                                            | Auth                |
|--------|-----------------------------------------------------------------|---------------------|
| GET    | `/api/tenants/:t/workspaces/:w/projects?includeArchived=true`   | workspace member    |
| POST   | `/api/tenants/:t/workspaces/:w/projects`                        | workspace `write`   |
| GET    | `/api/tenants/:t/workspaces/:w/projects/:p?includeArchived=true`| workspace member    |
| PATCH  | `/api/tenants/:t/workspaces/:w/projects/:p` (name/letter/color/bg/description) | workspace admin |
| POST   | `/api/tenants/:t/workspaces/:w/projects/:p/archive`             | workspace admin     |
| POST   | `/api/tenants/:t/workspaces/:w/projects/:p/unarchive`           | workspace admin     |

Slug + key are intentionally immutable — both are load-bearing
(slug in URLs, key in issue identifiers like `CMT-7`).

### User (de)activation

Tenant admins can flip another member's `users.is_active` flag. The
scope of the action is global (the user can't log in to any tenant
until reactivated), but the gate is tenant-admin because BIRA has no
system-level admin in v1 — the implicit rule is "if you can admin a
tenant the user belongs to, you can deactivate them." The user row
is preserved; FKs that reference the user use SET NULL or remain
valid, so historical attribution survives.

| Method | Path                                                              | Auth         |
|--------|-------------------------------------------------------------------|--------------|
| POST   | `/api/tenants/:t/members/:userId/deactivate`                      | tenant admin |
| POST   | `/api/tenants/:t/members/:userId/reactivate`                      | tenant admin |

Self-target → 400. Target user must be an active member of the same
tenant; otherwise 404. Login (and refresh, and any
`Authorization: Bearer` request) is rejected with 401 once the user
is deactivated — the auth middleware checks `isActive` on every
authenticated request, so existing sessions die on the next call.

### Issues (slice 1 — basic CRUD; slice 2 — hierarchy; slice C — description attachments)

Issues live under a project. The human-readable `key` (e.g. `CMT-241`)
is allocated atomically per project via a single Postgres
`UPDATE projects SET next_issue_number = next_issue_number + 1
RETURNING next_issue_number - 1`. Concurrent UPDATEs to the same row
serialise inside Postgres, so two parallel creates can never claim
the same seq — no app-side `SELECT FOR UPDATE` needed. Keys are
unique within a workspace.

Slice 2 adds parent/child hierarchy. **Schedules
(start/end/estimate) and issue links land in later slices.**
**Status transitions are NOT validated against any
workflow yet** — `status` is freely settable on create and update;
the workflow guard arrives in slice 5.

| Method | Path                                                                    | Auth                          |
|--------|-------------------------------------------------------------------------|-------------------------------|
| GET    | `/api/tenants/:t/workspaces/:w/issues`                                  | workspace member              |
| GET    | `/api/tenants/:t/workspaces/:w/projects/:p/issues`                      | workspace member              |
| POST   | `/api/tenants/:t/workspaces/:w/projects/:p/issues`                      | workspace `write`             |
| GET    | `/api/tenants/:t/workspaces/:w/projects/:p/issues/:key`                 | workspace member              |
| PATCH  | `/api/tenants/:t/workspaces/:w/projects/:p/issues/:key`                 | workspace `write`             |
| PATCH  | `/api/tenants/:t/workspaces/:w/projects/:p/issues/:key/parent`          | workspace `write`             |

Both list endpoints accept query params: `status`, `type`,
`assigneeUserId`, `teamId`, `label`, `priority`. The workspace-scoped
list additionally accepts `projectId`.

`POST` body: `{ type, title, description?, status?, priority?,
assigneeUserId?, teamId?, labels?, parent? }`. `type` is required;
defaults are `status='backlog'`, `priority='none'`, `labels=[]`,
`description=null`, `assigneeUserId=null`, `teamId=null`. The reporter
is the calling user. `parent` is an issue key (e.g. `'CMT-7'`); see
hierarchy rules below.

`PATCH` body: any subset of `{ title, description, status,
priority, assigneeUserId, teamId, labels, startDate, endDate,
estimate, descriptionAttachmentIds }`; at least one field is
required. Note: `parent` is **not** accepted here — hierarchy
mutations go through the dedicated `PATCH /:key/parent` endpoint
to keep the type / scope / cycle validation in one place.

**Team-on-Issue mutex (slice 1)** — `assigneeUserId` and `teamId` are
mutually exclusive: at most one is non-null on any given issue. Both
null is allowed (the issue lands on the planner's Unscheduled rail).
The rule lives in the usecase layer, not as a DB CHECK.

- On create / update, passing both non-null in the same call → 400
  (`Cannot set both assignee and team`).
- On update, the null-vs-absent semantics matter:
  - **SET** `assigneeUserId` to a non-null uuid while the existing
    issue has a non-null `teamId` → `teamId` is auto-cleared on the
    same write.
  - **SET** `teamId` to a non-null uuid while the existing issue has a
    non-null `assigneeUserId` → `assigneeUserId` is auto-cleared on
    the same write.
  - **CLEAR** `assigneeUserId` (`assigneeUserId: null`) → leaves
    `teamId` untouched. Same in the inverse direction. Clearing one
    field never implicitly modifies the other.
- Cross-workspace `teamId` references → 404 (matches the
  cross-workspace-not-found posture used elsewhere — no info leak).

`PATCH /:key/parent` body: `{ parent: string | null }` where
`parent` is an issue key or `null` to clear. Hierarchy rules:

- **Epic** is top-level — cannot have a parent.
- **Story** must have an Epic parent — cannot be cleared, cannot be
  created without one.
- **Task** / **Bug** can be parented under an Epic or Story, or be
  orphan leaves; clearing is allowed.
- Tasks and Bugs are always leaves — they cannot be parents.
- Parent must live in the same workspace AND the same project.
- Self-parent and cycles are rejected.

Response shape (slice 2 + slice C additions):
```ts
{
  id, key, workspaceId, projectId,
  type, status, priority, title,
  description: string | null,
  labels: string[],
  assigneeUserId: string | null,
  teamId: string | null,             // FK to teams.id; mutex with assigneeUserId
  reporterUserId: string | null,
  parentIssueId: string | null,    // internal uuid (kept for round-trip)
  parent: string | null,           // parent issue KEY, e.g. 'CMT-7'
  children: string[],              // child issue KEYS, ordered by seq asc
  startDate: string | null,        // YYYY-MM-DD; T/B only
  endDate: string | null,          // YYYY-MM-DD; T/B only
  estimate: number | null,         // points; T/B only
  // Slice C — `attachment:<uuid>` refs to files in this workspace.
  // Allowed on every issue type; max 20 per issue. Validated for
  // format + workspace-scoped existence on create / update; dangling
  // refs are silently filtered from `descriptionAttachments` on read.
  descriptionAttachmentIds: string[],
  // GET-by-key only — list endpoints OMIT this field. Hydrated from
  // `descriptionAttachmentIds` via a single batched file lookup.
  descriptionAttachments?: FileView[],
  seq: number,
  createdAt, updatedAt
}
```

## Quickstart

```bash
# from BIRA root, after npm install
cp server/.env.development.example server/.env.development
cd server
docker compose up -d postgres   # postgres on host :5433
npm run db:migrate
npm run seed                    # creates the four demo users (see below)
npm run dev                     # boots on :5001
```

```bash
# happy path
curl -s -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jordan@acme.com","password":"password123"}'
# returns { data: { user, token, refreshToken } }
```

### Demo users (after `npm run seed`)

| Email              | Password            | Role in `acme-corp` | Notes                                  |
|--------------------|---------------------|---------------------|----------------------------------------|
| `jordan@acme.com`  | `password123`       | `admin`             | Has a phone set (`+1-555-0100`)        |
| `sam@acme.com`     | `password123`       | `admin`             | Second admin — exercises admin-vs-admin flows |
| `morgan@acme.com`  | `password123`       | `write`             | Plain non-admin member                 |
| `riley@acme.com`   | `temp-riley-1234`   | `write`             | Pre-locked (`mustResetPassword=true`) — log in with this temp password to land on the must-reset gate without first running admin-reset. |

## Tests

Tests live under `server/tests/` and use Vitest + supertest against a real
Postgres test database (`bira_test`). Isolation comes from `truncateAll()`
in `beforeEach`; vitest runs a single forked worker so there's no
cross-file interference.

**Coverage** (count `tests/**/*.test.ts` for the live numbers — at the time
of writing, 45 files / 345 it-blocks):

| Area | Files |
|---|---|
| Unit | `tests/unit/` — passwordUtils, errorHandler, roleAtLeast, attachmentRefs, User / Issue / File / Comment entities |
| Auth | `tests/auth/` — register, login, refresh-token, profile, updateProfile, changePassword |
| Middleware | `tests/middleware/` — passwordResetGate (423 gate) |
| Tenants | `tests/tenants/` — list, create, get, deactivate, reactivate, deactivated gate |
| Tenant members | `tests/tenantMembers/` — list directory; `tests/admin/` — admin password reset |
| Workspaces | `tests/workspaces/` — list, create, get, update, archive, unarchive |
| Projects | `tests/projects/` — list, create, get |
| Issues | `tests/issues/` — create, get, list (project + workspace), update, key allocation (concurrency), set parent (hierarchy), description attachments (slice C) |
| Milestones | `tests/milestones/` — create, get, list (project + workspace), update, delete |
| Files | `tests/files/` — upload, download, delete |
| Comments | `tests/comments/` — create, list, update, delete |
| Workspace members | `tests/workspaceMembers/` — list, add, update role, remove (incl. last-admin guard, self-leave, team_memberships cascade) |
| Teams | `tests/teams/` — CRUD + member add/remove (workspace-member precondition) |
| Project access | `tests/projectAccess/` — team + user grants, four provenance branches, DB CHECK + Zod admin-on-team rejection |
| Middleware | `tests/middleware/resolveEffectiveWorkspaceRole.test.ts` — all four resolver branches |

**Known coverage gaps** (tracked, not yet covered):

- `tests/workflows/` — workflow CRUD endpoints + the `evaluateTransition`
  guard (all five rule types and the no-workflow permissive fallback).
- `tests/issueLinks/` — `relates` / `depends on` happy paths and the
  `wouldCreateCycle` rejection.
- `tests/mentionables/` — additional ranking edge cases beyond what's in `search.test.ts`.
- `tests/projects/` — `PUT /:slug/workflows/:issueType` (project-workflow
  assignment).

```bash
# one-time: copy the test env file and set up bira_test DB
cp .env.test.example .env.test
npm run db:test:reset   # drops + recreates bira_test and runs migrations

# run all specs
npm test

# watch mode during development
npm run test:watch
```

Factories are in `tests/helpers/factories.ts` — every helper goes through a
real service or usecase (never raw knex inserts) so tests stay honest about
the app's invariants.

Tests build their own state via `tests/helpers/factories.ts`. Don't call
the demo seed from a test — the seed is for manual QA. Factories go
through real services / usecases so the tests stay honest about
invariants.

### Files (slice A — filestore abstraction + PG driver)

Files are stored per workspace and streamed back on download.

| Method | Path                                                            | Auth                |
|--------|-----------------------------------------------------------------|---------------------|
| POST   | `/api/tenants/:t/workspaces/:w/files`                          | workspace `write`   |
| GET    | `/api/tenants/:t/workspaces/:w/files/:id`                      | workspace `read`    |
| DELETE | `/api/tenants/:t/workspaces/:w/files/:id`                      | workspace `write`   |

**`POST`** — multipart/form-data, field name `file`. Max 10 MB per file
(enforced by multer and a `CHECK` constraint on `files.size`). Returns a
`FileView` with `{ id, filename, mime, size, sha256, uploaderUserId,
createdAt, readUrl }`.

**`GET`** — streams raw bytes back with `Content-Type` and
`Content-Disposition: inline` headers. Does NOT require an active
workspace (reads from archived workspaces are allowed).

**`DELETE`** — hard delete only. The uploader OR any workspace `admin`
may delete. Returns `204 No Content`.

**Driver selection** — set `FILESTORE_DRIVER` env var:
- `pg` (default) — stores bytes in the `file_blobs` Postgres table.
  No extra infrastructure needed; suitable for dev and small installs.
- `s3` — stub that throws HTTP 501. Full S3 implementation is deferred
  pending explicit approval to add the AWS SDK dep.

#### Attachment ref scheme (`attachment:<uuid>`)

Comments (slice B) and issue descriptions (slice C) both reference files
via the same `attachment:<uuid>` ref string stored in a `text[]` column —
`comments.attachment_ids` and `issues.description_attachment_ids`
respectively. The prefix keeps these columns self-describing and
forward-compatible with other ref types.

- Helpers live at `src/lib/attachmentRefs.ts` (`parseAttachmentRef`,
  `buildAttachmentRef`, `extractFileIds`).
- `src/lib/validateAttachmentRefs.ts` does the workspace-scoped
  existence check used at every write path (create / update). It throws
  HTTP 400 on malformed refs OR refs pointing at files outside the
  current workspace.
- Reads silently filter dangling refs (file deleted after the comment /
  issue was last edited) from the *expanded* views, while the raw refs
  array is preserved verbatim as the source of truth.
- Limits: comments cap at **10** attachments per record;
  issue-description attachments cap at **20** (descriptions tend to
  carry more inline images).

Files are NOT cascade-deleted when a comment or issue that references
them is deleted — the files table is independent and a single file may
be referenced from multiple places.

### Issue links (slice 8 — relates + depends on)

| Method | Path                                                                            | Auth                |
|--------|---------------------------------------------------------------------------------|---------------------|
| POST   | `/api/tenants/:t/workspaces/:w/projects/:p/issues/:key/relates`                | workspace `write`   |
| DELETE | `/api/tenants/:t/workspaces/:w/projects/:p/issues/:key/relates/:relatedKey`    | workspace `write`   |
| POST   | `/api/tenants/:t/workspaces/:w/projects/:p/issues/:key/dependencies`           | workspace `write`   |
| DELETE | `/api/tenants/:t/workspaces/:w/projects/:p/issues/:key/dependencies/:blockerKey` | workspace `write` |

`relates` is symmetric and untyped beyond the verb (every type allowed).
`depends on` is **Task-only** and directed: `key depends on blockerKey`
means `key` cannot start until `blockerKey` ends. Cycles are rejected at
the BE via `wouldCreateCycle` (recursive CTE walk over the existing
edges).

Body shape: `relates` takes `{ relatedKey }`, `dependencies` takes
`{ blockerKey }`. Each mutation returns the depender's full IssueView
so the FE doesn't have to refetch.

### Workflows (slice 5)

| Method | Path                                                                | Auth                       |
|--------|---------------------------------------------------------------------|----------------------------|
| GET    | `/api/tenants/:t/workspaces/:w/workflows`                           | workspace member           |
| POST   | `/api/tenants/:t/workspaces/:w/workflows`                           | workspace `write`          |
| GET    | `/api/tenants/:t/workspaces/:w/workflows/:slug`                     | workspace member           |
| PATCH  | `/api/tenants/:t/workspaces/:w/workflows/:slug`                     | workspace `write`          |
| DELETE | `/api/tenants/:t/workspaces/:w/workflows/:slug`                     | workspace `admin`          |

A workflow is a directed graph of status nodes joined by transitions; each
transition can carry zero or more rules (closed enum: `role`,
`assignee_only`, `reporter_only`, `required_fields`, `not_self`). On
PATCH, passing `nodes` and/or `transitions` performs a full-replace —
existing rows are deleted then re-inserted in one transaction.

On PATCH, each `nodes[]` entry may carry an optional `id` (uuid).
Supplied ids are preserved verbatim through the delete-then-insert so
that `transitions[]` in the same PATCH can reference them; omit the id
on freshly-added nodes and the BE mints one. Within-input uniqueness
is enforced (duplicate supplied ids → 400). This lets the editor save
nodes + transitions atomically without round-tripping for fresh node
uuids first.

The status-transition guard (`evaluateTransition`) runs from
`updateIssue` whenever `status` changes and acting-user context is
supplied: deny → 403 with the reason. If the project's `(project,
issueType)` pair has no explicit workflow and no slug-default fallback
exists, the guard returns `noWorkflow=true` and the update is allowed
through.

### Project ↔ workflow assignment

| Method | Path                                                                          | Auth                |
|--------|-------------------------------------------------------------------------------|---------------------|
| GET    | `/api/tenants/:t/workspaces/:w/projects/:p/workflows`                         | workspace member    |
| PUT    | `/api/tenants/:t/workspaces/:w/projects/:p/workflows/:issueType`              | workspace `write`   |

GET returns a record `{ T?, B?, S?, E? }` of workflow slugs. PUT body is
`{ workflowSlug }`; `:issueType` must be one of `T|B|S|E`.

### Milestones

Project-level deadline annotations. Pure annotation: no link to issues, no
completion flag — the FE derives "overdue" from `today > date`.

| Method | Path                                                                  | Auth                |
|--------|-----------------------------------------------------------------------|---------------------|
| GET    | `/api/tenants/:t/workspaces/:w/projects/:p/milestones`               | workspace member    |
| POST   | `/api/tenants/:t/workspaces/:w/projects/:p/milestones`               | workspace `write`   |
| GET    | `/api/tenants/:t/workspaces/:w/projects/:p/milestones/:id`           | workspace member    |
| PATCH  | `/api/tenants/:t/workspaces/:w/projects/:p/milestones/:id`           | workspace `write`   |
| DELETE | `/api/tenants/:t/workspaces/:w/projects/:p/milestones/:id`           | workspace `write`   |
| GET    | `/api/tenants/:t/workspaces/:w/milestones`                            | workspace member    |

Body shape: `{ name (1-200), description? (≤2000, nullable), date (YYYY-MM-DD) }`.
PATCH requires at least one field; PATCH/DELETE 404 when the `:id` does not
belong to the URL's project (cross-project access through the wrong
project slug is rejected). The workspace-scoped GET accepts an optional
`?projectId=<uuid>` filter; both list endpoints sort by `date` ascending
(soonest first).

`workspace_id` AND `project_id` are denormalised on each row (mirrors
`issues`); queries stay JOIN-free per the no-DB-JOINs rule. Mutations
(POST/PATCH/DELETE) are blocked with 409 when the project is archived;
reads work regardless. Cross-workspace milestone ids 404 — no info leak.

### Comments (slice B)

| Method | Path                                                                  | Auth                |
|--------|-----------------------------------------------------------------------|---------------------|
| GET    | `/api/tenants/:t/workspaces/:w/projects/:p/issues/:key/comments`     | workspace member    |
| POST   | `/api/tenants/:t/workspaces/:w/projects/:p/issues/:key/comments`     | workspace `write`   |
| PATCH  | `/api/tenants/:t/workspaces/:w/comments/:commentId`                  | workspace `write`   |
| DELETE | `/api/tenants/:t/workspaces/:w/comments/:commentId`                  | workspace `write`   |

Comments are workspace-unique by `commentId`, so PATCH/DELETE do not
require a project slug. Body cap: 50 000 chars; up to 10 attachment refs
per comment. PATCH/DELETE are gated on author OR workspace `admin`.
Mentions (`@[user:<uuid>]`) are extracted on every write and stored in a
jsonb array — see `docs/specs/mentions.md`.

### Mentionables

| Method | Path                                                                 | Auth                |
|--------|----------------------------------------------------------------------|---------------------|
| GET    | `/api/tenants/:t/workspaces/:w/mentionables/search?q=&types=&limit=` | workspace `read`    |

Both `types=user` and `types=team` are supported (Domain B). Team hits
return `{ id, type:'team', label, sublabel, slug, color }`. The default
when `types` is omitted now combines users and teams.

### Tenant members

| Method | Path                                              | Auth          |
|--------|---------------------------------------------------|---------------|
| GET    | `/api/tenants/:t/members`                         | tenant member |
| GET    | `/api/tenants/:t/members/:userId`                 | tenant member |

`GET /api/tenants/:t/members` returns every row in `tenant_memberships`
for the tenant, hydrated with user details (id, email, displayName,
firstName, lastName, avatar, isActive). Sorted alphabetically by
display name. Open to any tenant member (read+) — name and email
are not sensitive within a tenant.

Service is two independent queries (`tenant_memberships` + `users`)
combined in JS, no SQL JOIN — see
`feedback_no_db_joins_without_approval` rule.

Per-user mutations (reset password, deactivate, reactivate) live on
the `:userId` sub-routes — see "Password reset gate" and "User
(de)activation" above.

### Workspace members

| Method | Path                                                                          | Auth                          |
|--------|-------------------------------------------------------------------------------|-------------------------------|
| GET    | `/api/tenants/:t/workspaces/:w/members`                                       | workspace member              |
| POST   | `/api/tenants/:t/workspaces/:w/members`                                       | workspace `admin`             |
| PATCH  | `/api/tenants/:t/workspaces/:w/members/:membershipId`                         | workspace `admin`             |
| DELETE | `/api/tenants/:t/workspaces/:w/members/:membershipId`                         | workspace `admin` OR self     |

Direct-add only — POST refuses with 400 if the target user isn't an
active tenant member; 409 if they're already in the workspace. The
last-admin guard counts active tenant admins as implicit workspace
admins, so PATCH (demotion) and DELETE refuse with 409 when removing
the target would leave zero effective admins.

`workspace_memberships` carries `status` (`active | invited |
deactivated`, default `active`) and `last_seen_at`. v1 only writes
`active` rows — `invited` is reserved for a future invite-flow phase.

DELETE cascades inside the same transaction:
- `team_memberships` rows for the user in this workspace's teams.
- `project_user_access` rows for the user on this workspace's
  projects.

### Teams

| Method | Path                                                                          | Auth                |
|--------|-------------------------------------------------------------------------------|---------------------|
| GET    | `/api/tenants/:t/workspaces/:w/teams`                                         | workspace member    |
| POST   | `/api/tenants/:t/workspaces/:w/teams`                                         | workspace `admin`   |
| GET    | `/api/tenants/:t/workspaces/:w/teams/:teamSlug`                               | workspace member    |
| PATCH  | `/api/tenants/:t/workspaces/:w/teams/:teamSlug`                               | workspace `admin`   |
| DELETE | `/api/tenants/:t/workspaces/:w/teams/:teamSlug`                               | workspace `admin`   |
| GET    | `/api/tenants/:t/workspaces/:w/teams/:teamSlug/members`                       | workspace member    |
| POST   | `/api/tenants/:t/workspaces/:w/teams/:teamSlug/members`                       | workspace `admin`   |
| DELETE | `/api/tenants/:t/workspaces/:w/teams/:teamSlug/members/:userId`               | workspace `admin`   |

Teams are workspace-scoped flat groups. Schema: `slug, name,
description, color`. Slug is workspace-unique and immutable. Teams
carry no role of their own — the role lives on the project-access
grant. Adding a user to a team requires that user to be an active
member of the workspace (400 otherwise).

### Project access

| Method | Path                                                                                                | Auth                |
|--------|-----------------------------------------------------------------------------------------------------|---------------------|
| GET    | `/api/tenants/:t/workspaces/:w/projects/:p/access`                                                  | workspace member    |
| GET    | `/api/tenants/:t/workspaces/:w/projects/:p/access/effective-members`                                | workspace member    |
| POST   | `/api/tenants/:t/workspaces/:w/projects/:p/access/teams`                                            | workspace `admin`   |
| PATCH  | `/api/tenants/:t/workspaces/:w/projects/:p/access/teams/:teamId`                                    | workspace `admin`   |
| DELETE | `/api/tenants/:t/workspaces/:w/projects/:p/access/teams/:teamId`                                    | workspace `admin`   |
| POST   | `/api/tenants/:t/workspaces/:w/projects/:p/access/users`                                            | workspace `admin`   |
| PATCH  | `/api/tenants/:t/workspaces/:w/projects/:p/access/users/:userId`                                    | workspace `admin`   |
| DELETE | `/api/tenants/:t/workspaces/:w/projects/:p/access/users/:userId`                                    | workspace `admin`   |

Two-table design. `project_team_access` carries roles `'write' | 'read'`
only — admin is excluded both at the route (Zod) and at the DB CHECK
constraint, mirroring the v1 rule "admin is never inherited via a
team". `project_user_access` allows the full ladder including admin.

`GET /effective-members` returns a flat per-user list with
`provenance` (one of `explicit-user`, `tenant-admin`,
`workspace-admin`, `team`) and, when `provenance === 'team'`, a
`viaTeams[]` entry showing which teams contributed. Precedence:
`explicit-user > tenant-admin > workspace-admin > team`. Team grants
combine via union (highest of `write` / `read` wins).

`resolveEffectiveWorkspaceRole` (the workspace-scope middleware) was
extended in this slice: if a user has any active grant in
`project_user_access` OR is a member of any team with a row in
`project_team_access` for a project in this workspace, they get
implicit `'read'` at workspace scope. Lets a project-only contributor
navigate the workspace shell without being granted workspace `write`.

## What's NOT here yet

Audit log + rate limiting. The pending-invite flow (so non-tenant-
member emails can be invited rather than rejected with 400) is a
separate phase. The S3 file-storage driver is stubbed (slice A ships
PG only). Sprints, backlog, custom fields, JQL, SSO, and a public
REST API are out-of-scope per `.claude/rules/v1-constraints.md`.

Issue / comment visibility filters are NOT yet narrowed by project
access — anyone with workspace `read` still sees everything in the
workspace. Tightening that is a follow-up once the FE is wired.

The frontend under `web/` is **not** wired to this API yet — it
still reads from `web/src/fixtures.ts`. Wiring is a separate phase
once endpoints stabilise.
