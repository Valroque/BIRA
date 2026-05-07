# BIRA MCP server

A Model Context Protocol server that wraps the BIRA backend so AI clients
(Claude Desktop, Claude Code, etc.) can log in and read/write BIRA data
through tool calls.

The toolset tracks the BE surface as new slices land — when a new HTTP
endpoint ships in `server/`, add the matching MCP tool here in the same
change.

## Tools

Every tool description is prefixed with `[<role-required> · <METHOD> <path>]`
so an LLM picking up a fresh BIRA MCP context can see at a glance which gate
the BE applies and which endpoint the tool wraps. The role tokens are a
closed set (see `mcp/src/index.ts` header banner). The tables below mirror
that prefix grammar in column form.

### Auth
| Tool | Role | Endpoint | What it does |
|---|---|---|---|
| `login` | `public` | `POST /api/auth/login` | Auth against the BIRA backend; cache token in process. **Dev fallback only** — production agents should use `BIRA_API_TOKEN` instead (see Auth model below). |
| `logout` | _(client-only)_ | _(no HTTP)_ | Clear the cached JWT. The `BIRA_API_TOKEN` env (if set) remains as the fallback Bearer. |
| `register` | `public` | `POST /api/auth/register` | Create a new user with no memberships. |
| `profile` | `authed` | `GET /api/auth/profile` | Get the currently logged-in BIRA user profile. |
| `whoami` | `authed` | `GET /api/auth/profile` | Confirm which user this MCP process is acting as. Especially useful when the credential is `BIRA_API_TOKEN` and there was no interactive `login`. |
| `update_profile` | `self` | `PATCH /api/auth/me` | Patch firstName / lastName / email / phone / avatar. |
| `change_password` | `self` | `POST /api/auth/change-password` | Self-service password change; required to clear `mustResetPassword`. |
| `refresh_token` | `public` | `POST /api/auth/refresh-token` | Exchange a refresh token for a new access token. |

### Personal access tokens
| Tool | Role | Endpoint | What it does |
|---|---|---|---|
| `whoami` | `authed` | `GET /api/auth/profile` | Confirm which user this MCP process is acting as (also listed under Auth). |
| `list_pats` | `self` | `GET /api/auth/tokens` | List the current user's PATs (metadata only; secret never returned). Works under either JWT or PAT auth so agents can introspect their own tokens. |
| `create_pat` | `self+jwt-only` | `POST /api/auth/tokens` | Mint a new PAT (`name`, `expiresIn ∈ {never, 30d, 90d, 1y}`). Plaintext returned **exactly once**. **Requires interactive `login`** — BE returns 403 `PAT_CANNOT_MINT_PAT` when called via env token. |
| `revoke_pat` | `self+jwt-only` | `DELETE /api/auth/tokens/:id` | Revoke one of the current user's PATs. **Requires interactive `login`** (same mint guard). |

### Tenants
| Tool | Role | Endpoint | What it does |
|---|---|---|---|
| `list_tenants` | `public` | `GET /api/tenants` | All active tenants (pre-login picker). |
| `get_tenant` | `tenant-member` | `GET /api/tenants/:t` | Tenant detail by slug. |
| `create_tenant` | `authed` | `POST /api/tenants` | Any authenticated user; caller becomes admin. |
| `update_tenant` | `tenant-admin` | `PATCH /api/tenants/:t` | Rename + cosmetics (slug + plan immutable). |
| `deactivate_tenant` | `tenant-admin` | `POST /api/tenants/:t/deactivate` | Soft-freeze; disappears from public listing. |
| `reactivate_tenant` | `tenant-admin` | `POST /api/tenants/:t/reactivate` | Restore a deactivated tenant. |
| `list_tenant_members` | `tenant-member` | `GET /api/tenants/:t/members` | Hydrated tenant directory. |
| `get_tenant_member` | `tenant-member` | `GET /api/tenants/:t/members/:userId` | Single user lookup by uuid (display-name fallback). |
| `add_tenant_member` | `tenant-admin` | `POST /api/tenants/:t/members` | Direct-add a registered user to the tenant. |
| `update_tenant_member_role` | `tenant-admin` | `PATCH /api/tenants/:t/members/:userId` | Patch role; last-admin guard. |
| `remove_tenant_member` | `self-or-tenant-admin` | `DELETE /api/tenants/:t/members/:userId` | Tenant admin removes anyone, or target self-leaves. |
| `admin_reset_password` | `tenant-admin` | `POST /api/tenants/:t/members/:userId/reset-password` | Tenant admin issues a one-time temp password for another member. |
| `deactivate_user` | `tenant-admin` | `POST /api/tenants/:t/members/:userId/deactivate` | Tenant admin flips another member's `isActive` flag (effective scope is global). |
| `reactivate_user` | `tenant-admin` | `POST /api/tenants/:t/members/:userId/reactivate` | Restore a deactivated user. |

### Workspaces
| Tool | Role | Endpoint | What it does |
|---|---|---|---|
| `list_workspaces` | `tenant-member` | `GET /api/tenants/:t/workspaces` | Workspaces visible to the user; supports `includeArchived`. |
| `get_workspace` | `ws-member` | `GET /api/tenants/:t/workspaces/:w` | Workspace detail; supports `includeArchived`. |
| `create_workspace` | `tenant-admin` | `POST /api/tenants/:t/workspaces` | Create a workspace. |
| `update_workspace` | `ws-admin` | `PATCH /api/tenants/:t/workspaces/:w` | Patch name/letter/color/bg (slug immutable). |
| `archive_workspace` | `tenant-admin` | `POST /api/tenants/:t/workspaces/:w/archive` | Freeze workspace writes. |
| `unarchive_workspace` | `tenant-admin` | `POST /api/tenants/:t/workspaces/:w/unarchive` | Restore a frozen workspace. |

### Projects
| Tool | Role | Endpoint | What it does |
|---|---|---|---|
| `list_projects` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/projects` | Projects in a workspace; supports `includeArchived`. |
| `get_project` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/projects/:p` | Project detail; supports `includeArchived`. |
| `create_project` | `ws-write` | `POST /api/tenants/:t/workspaces/:w/projects` | Create a project. |
| `update_project` | `ws-admin` | `PATCH /api/tenants/:t/workspaces/:w/projects/:p` | Patch project (slug + key immutable). |
| `archive_project` | `ws-admin` | `POST /api/tenants/:t/workspaces/:w/projects/:p/archive` | Freeze project writes. |
| `unarchive_project` | `ws-admin` | `POST /api/tenants/:t/workspaces/:w/projects/:p/unarchive` | Restore a frozen project. |
| `get_project_workflows` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/projects/:p/workflows` | Per-issue-type workflow assignment. |
| `set_project_workflow` | `ws-write` | `PUT /api/tenants/:t/workspaces/:w/projects/:p/workflows/:issueType` | Assign a workflow slug to a (project, issueType) pair. |

### Issues
| Tool | Role | Endpoint | What it does |
|---|---|---|---|
| `list_issues` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/issues` or `GET /api/tenants/:t/workspaces/:w/projects/:p/issues` | Workspace-scoped or project-scoped (when `projectSlug` is set). |
| `get_issue` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/projects/:p/issues/:k` | Issue detail by key (e.g. `CMT-7`). |
| `create_issue` | `ws-write` | `POST /api/tenants/:t/workspaces/:w/projects/:p/issues` | Create an issue; honours hierarchy + workflow guards. |
| `update_issue` | `ws-write` | `PATCH /api/tenants/:t/workspaces/:w/projects/:p/issues/:k` | Update an issue; status changes validated against the workflow. |
| `set_issue_parent` | `ws-write` | `PATCH /api/tenants/:t/workspaces/:w/projects/:p/issues/:k/parent` | Move an issue under a new parent (or clear). |

### Issue links
| Tool | Role | Endpoint | What it does |
|---|---|---|---|
| `add_issue_relation` | `ws-write` | `POST /api/tenants/:t/workspaces/:w/projects/:p/issues/:k/relates` | Add a symmetric `relates` link. |
| `remove_issue_relation` | `ws-write` | `DELETE /api/tenants/:t/workspaces/:w/projects/:p/issues/:k/relates/:relatedKey` | Remove a `relates` link. |
| `add_issue_dependency` | `ws-write` | `POST /api/tenants/:t/workspaces/:w/projects/:p/issues/:k/dependencies` | Add a directed `depends on` (Tasks; rejects cycles). |
| `remove_issue_dependency` | `ws-write` | `DELETE /api/tenants/:t/workspaces/:w/projects/:p/issues/:k/dependencies/:blockerKey` | Remove a `depends on` edge. |

### Comments
| Tool | Role | Endpoint | What it does |
|---|---|---|---|
| `list_comments` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/projects/:p/issues/:k/comments` | Comments on an issue, oldest first. |
| `create_comment` | `ws-write` | `POST /api/tenants/:t/workspaces/:w/projects/:p/issues/:k/comments` | Add a comment; up to 10 attachment refs. |
| `update_comment` | `ws-write` | `PATCH /api/tenants/:t/workspaces/:w/comments/:commentId` | Edit a comment (usecase further restricts to author or workspace admin). |
| `delete_comment` | `ws-write` | `DELETE /api/tenants/:t/workspaces/:w/comments/:commentId` | Delete a comment (author or workspace admin only, enforced in the usecase). |

### Milestones
| Tool | Role | Endpoint | What it does |
|---|---|---|---|
| `list_milestones` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/milestones` or `GET /api/tenants/:t/workspaces/:w/projects/:p/milestones` | Workspace-scoped or project-scoped (when `projectSlug` is set); workspace form accepts `projectId` filter. |
| `get_milestone` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/projects/:p/milestones/:milestoneId` | Project-scoped lookup by uuid. |
| `create_milestone` | `ws-write` | `POST /api/tenants/:t/workspaces/:w/projects/:p/milestones` | Create a milestone; rejected on archived projects. |
| `update_milestone` | `ws-write` | `PATCH /api/tenants/:t/workspaces/:w/projects/:p/milestones/:milestoneId` | Patch a milestone; rejected on archived projects. |
| `delete_milestone` | `ws-write` | `DELETE /api/tenants/:t/workspaces/:w/projects/:p/milestones/:milestoneId` | Delete a milestone; rejected on archived projects. |

### Workflows
| Tool | Role | Endpoint | What it does |
|---|---|---|---|
| `list_workflows` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/workflows` | List workflows in a workspace. |
| `get_workflow` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/workflows/:workflowSlug` | Workflow with nodes, transitions, and rules. |
| `create_workflow` | `ws-write` | `POST /api/tenants/:t/workspaces/:w/workflows` | Create a workflow. |
| `update_workflow` | `ws-write` | `PATCH /api/tenants/:t/workspaces/:w/workflows/:workflowSlug` | Full-replace nodes / transitions; or rename. |
| `delete_workflow` | `ws-admin` | `DELETE /api/tenants/:t/workspaces/:w/workflows/:workflowSlug` | Delete a workflow. |

### Mentionables
| Tool | Role | Endpoint | What it does |
|---|---|---|---|
| `search_mentionables` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/mentionables/search` | Search for `@`-mention candidates (users + teams). |

### Workspace members
| Tool | Role | Endpoint | What it does |
|---|---|---|---|
| `list_workspace_members` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/members` | Hydrated directory. |
| `add_workspace_member` | `ws-admin` | `POST /api/tenants/:t/workspaces/:w/members` | Direct-add (target must already be an active tenant member). |
| `update_workspace_member_role` | `ws-admin` | `PATCH /api/tenants/:t/workspaces/:w/members/:membershipId` | Patch role; last-admin guard refuses demoting the only effective admin. |
| `remove_workspace_member` | `self-or-ws-admin` | `DELETE /api/tenants/:t/workspaces/:w/members/:membershipId` | Workspace admin OR self-leave; cascades clear team_memberships + project_user_access. |

### Teams
| Tool | Role | Endpoint | What it does |
|---|---|---|---|
| `list_teams` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/teams` | Teams in a workspace, with hydrated members. |
| `create_team` | `ws-admin` | `POST /api/tenants/:t/workspaces/:w/teams` | Create a team (slug immutable). |
| `get_team` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/teams/:teamSlug` | Team detail with members. |
| `update_team` | `ws-admin` | `PATCH /api/tenants/:t/workspaces/:w/teams/:teamSlug` | Patch name/description/color. |
| `delete_team` | `ws-admin` | `DELETE /api/tenants/:t/workspaces/:w/teams/:teamSlug` | CASCADE removes team_memberships + project_team_access. |
| `list_team_members` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/teams/:teamSlug/members` | Team roster. |
| `add_team_member` | `ws-admin` | `POST /api/tenants/:t/workspaces/:w/teams/:teamSlug/members` | Add a workspace member to a team. |
| `remove_team_member` | `ws-admin` | `DELETE /api/tenants/:t/workspaces/:w/teams/:teamSlug/members/:userId` | Remove a member from a team. |

### Project access
| Tool | Role | Endpoint | What it does |
|---|---|---|---|
| `list_project_access` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/projects/:p/access` | Returns `{ teams[], users[] }` for a project. |
| `list_project_effective_members` | `ws-member` | `GET /api/tenants/:t/workspaces/:w/projects/:p/access/effective-members` | Flat per-user list with provenance + `viaTeams[]`. |
| `add_project_team_grant` | `ws-admin` | `POST /api/tenants/:t/workspaces/:w/projects/:p/access/teams` | Grant a team write/read on the project (admin never inherited via team). |
| `update_project_team_grant` | `ws-admin` | `PATCH /api/tenants/:t/workspaces/:w/projects/:p/access/teams/:teamId` | Change a team's project role (write ↔ read). |
| `remove_project_team_grant` | `ws-admin` | `DELETE /api/tenants/:t/workspaces/:w/projects/:p/access/teams/:teamId` | Revoke a team grant. |
| `add_project_user_grant` | `ws-admin` | `POST /api/tenants/:t/workspaces/:w/projects/:p/access/users` | Explicit user grant (admin/write/read); target must be an active workspace member or tenant admin. |
| `update_project_user_grant` | `ws-admin` | `PATCH /api/tenants/:t/workspaces/:w/projects/:p/access/users/:userId` | Change an explicit user's project role. |
| `remove_project_user_grant` | `ws-admin` | `DELETE /api/tenants/:t/workspaces/:w/projects/:p/access/users/:userId` | Revoke an explicit user grant. |

### Files
File upload + download are intentionally not exposed as MCP tools — multipart
and binary streams don't fit the JSON-text envelope. Use the HTTP API at
`/api/tenants/:t/workspaces/:w/files` directly.

## Run locally

The server speaks stdio — it's launched by the MCP client, not run
standalone. To smoke-test the launch, build it:

```bash
npm run build --workspace=@bira/mcp
node mcp/dist/index.js
# (will sit waiting for stdio messages — Ctrl-C to exit)
```

## Configure clients

The repo ships a `.mcp.json` at the root, so **Claude Code** in this
project picks it up automatically (it'll prompt to approve on first use).

For **Claude Desktop**, add to
`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bira": {
      "command": "node",
      "args": ["/absolute/path/to/BIRA/mcp/dist/index.js"],
      "env": {
        "BIRA_API_URL": "http://localhost:5001",
        "BIRA_API_TOKEN": "bira_pat_…"
      }
    }
  }
}
```

Make sure `npm run build --workspace=@bira/mcp` has been run, and that
the BIRA backend is up (`npm run dev:server`).

## Env

| Var | Default | Notes |
|---|---|---|
| `BIRA_API_URL` | `http://localhost:5001` | BIRA backend base URL |
| `BIRA_API_TOKEN` | _(unset)_ | Personal access token (`bira_pat_…`). Recommended credential — see Auth model below. |

## Auth model

The recommended credential is a **Personal Access Token (PAT)** set via the
`BIRA_API_TOKEN` env var. PATs are scoped to a single user, can be revoked
without rotating a password, never leak into chat, and survive process
restarts because the credential lives in the client's config rather than
in this MCP server's memory.

### Generate and install a PAT

1. Log into the BIRA web app as the user the agent should act as.
2. Go to **Settings → Profile → API tokens**.
3. Click **Generate new token**, give it a descriptive name (e.g.
   `claude-desktop`), pick an expiry (`Never`, `30 days`, `90 days`, or
   `1 year`), and submit.
4. **Copy the plaintext immediately** — it's shown exactly once and
   cannot be retrieved later. If you lose it, revoke the token and mint
   a new one.
5. Paste it into your MCP client config under `env.BIRA_API_TOKEN` (see
   the Configure clients example above).
6. Restart the MCP client so the new env var is picked up.

Once the env var is set, every authenticated tool call uses the PAT as the
Bearer credential. Confirm with the `whoami` tool — it should return the
user that owns the PAT.

### Credential precedence

If both an env-token and an interactive `login` happen in the same
process, the **JWT from `login` wins** for the rest of the process. This
is a deliberate "dev fallback" — you can override a config-driven session
mid-conversation by logging in as a different user. Calling `logout`
clears the in-process JWT but does **not** clear the env-token; the env
PAT remains as the fallback Bearer.

### `login` / `logout` are dev-only

The `login` tool puts the user's email and password into the chat
transcript. **Do not use it in production agents** — use a PAT instead.
The `login`/`logout` pair stays in the toolset only because it's the
fastest path for local hacking when the BIRA web app isn't reachable.

### Mint guard

`create_pat` and `revoke_pat` require an interactive `login` first. The
BE refuses to let a PAT mint or revoke other PATs and returns
**403 `PAT_CANNOT_MINT_PAT`** in that case. Token CRUD is intentionally
gated to JWT-authed sessions so a leaked PAT cannot bootstrap a fresh
credential.

### Seeded demo user

The seeded demo user is `jordan@acme.com` / `password123` (see
`server/db/seeds/01_demo.ts`). Log in as Jordan in the web app to mint a
PAT for local development.
