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

Users carry a `mustResetPassword` boolean. When set, every request to
`/api/tenants/*` (including the top-level tenant list) is blocked with:

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
tenant just stops appearing in the default `GET /api/tenants` list. The
owning admin can opt back in with `?includeDeactivated=true` to find
and reactivate it.

| Method | Path                                              | Auth                       |
|--------|---------------------------------------------------|----------------------------|
| GET    | `/api/tenants?includeDeactivated=true`            | any authenticated user     |
| POST   | `/api/tenants`                                    | any authenticated user     |
| GET    | `/api/tenants/:t`                                 | tenant member              |
| POST   | `/api/tenants/:t/deactivate`                      | tenant admin               |
| POST   | `/api/tenants/:t/reactivate`                      | tenant admin               |

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

### Issues (slice 1 — basic CRUD; slice 2 — hierarchy; slice C — description attachments)

Issues live under a project. The human-readable `key` (e.g. `CMT-241`)
is allocated atomically per project via `projects.next_issue_number`
inside the same transaction as the insert, so concurrent creates
within a project never collide. Keys are unique within a workspace.

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
`assigneeUserId`, `label`, `priority`. The workspace-scoped list
additionally accepts `projectId`.

`POST` body: `{ type, title, description?, status?, priority?,
assigneeUserId?, labels?, parent? }`. `type` is required; defaults are
`status='backlog'`, `priority='none'`, `labels=[]`,
`description=null`, `assigneeUserId=null`. The reporter is the
calling user. `parent` is an issue key (e.g. `'CMT-7'`); see
hierarchy rules below.

`PATCH` body: any subset of `{ title, description, status,
priority, assigneeUserId, labels }`; at least one field is
required. Note: `parent` is **not** accepted here — hierarchy
mutations go through the dedicated `PATCH /:key/parent` endpoint
to keep the type / scope / cycle validation in one place.

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

**Coverage** (45 files, 361 tests):

| Area | Files |
|---|---|
| Unit | `tests/unit/` — passwordUtils, errorHandler, roleAtLeast, User entity, Issue entity, File entity |
| Auth | `tests/auth/` — register, login, refresh-token, profile, updateProfile, changePassword |
| Middleware | `tests/middleware/` — passwordResetGate (423 gate) |
| Tenants | `tests/tenants/` — list, create, get, deactivate, reactivate, deactivated gate |
| Tenant members | `tests/admin/` — admin password reset |
| Workspaces | `tests/workspaces/` — list, create, get, update, archive, unarchive |
| Projects | `tests/projects/` — list, create, get |
| Issues | `tests/issues/` — create, get, list (project + workspace), update, key allocation (concurrency), set parent (hierarchy), description attachments (slice C) |
| Files | `tests/files/` — upload, download, delete |
| Comments | `tests/comments/` — create, list, update, delete |

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

## What's NOT here yet

Issue schedules + estimate, issue links (`relates`,
`depends on`), workflows + the status-transition guard, comments,
teams, project memberships, invites, audit log, rate limiting. Each
is a future slice. The S3 file-storage driver is stubbed (slice A
ships PG only).

The frontend under `web/` is **not** wired to this API yet — it
still reads from `web/src/fixtures.ts`. Wiring is a separate phase
once endpoints stabilise.
