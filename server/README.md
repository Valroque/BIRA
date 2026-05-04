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

## Quickstart

```bash
# from BIRA root, after npm install
cp server/.env.development.example server/.env.development
cd server
docker compose up -d postgres   # postgres on host :5433
npm run db:migrate
npm run seed                    # creates jordan@acme.com / password123
npm run dev                     # boots on :5001
```

```bash
# happy path
curl -s -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jordan@acme.com","password":"password123"}'
# returns { data: { user, token, refreshToken } }
```

## What's NOT here yet

Issues, themes, workflows, comments, teams, project memberships,
invites, audit log, rate limiting. Each is a future phase.

The frontend under `web/` is **not** wired to this API yet — it
still reads from `web/src/fixtures.ts`. Wiring is a separate phase
once endpoints stabilise.
