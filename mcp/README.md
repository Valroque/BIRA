# BIRA MCP server

A Model Context Protocol server that wraps the BIRA backend so AI clients
(Claude Desktop, Claude Code, etc.) can log in and read/write BIRA data
through tool calls.

The toolset tracks the BE surface as new slices land — when a new HTTP
endpoint ships in `server/`, add the matching MCP tool here in the same
change.

## Tools

### Auth
| Tool | What it does |
|---|---|
| `login` | Auth against `/api/auth/login`; cache token in process. **Dev fallback only** — production agents should use `BIRA_API_TOKEN` instead (see Auth model below). |
| `logout` | Clear the cached JWT. The `BIRA_API_TOKEN` env (if set) remains as the fallback Bearer. |
| `register` | `POST /api/auth/register` — public; create a new user with no memberships |
| `profile` | `GET /api/auth/profile` |
| `whoami` | `GET /api/auth/profile` — confirm which user this MCP process is acting as. Especially useful when the credential is `BIRA_API_TOKEN` and there was no interactive `login`. |
| `update_profile` | `PATCH /api/auth/me` (firstName / lastName / email / phone / avatar) |
| `change_password` | Self-service password change; required to clear `mustResetPassword` |
| `refresh_token` | Exchange a refresh token for a new access token |

### Personal access tokens
| Tool | What it does |
|---|---|
| `list_pats` | `GET /api/auth/tokens` — list the current user's PATs (metadata only; secret never returned). Works under JWT or PAT auth. |
| `create_pat` | `POST /api/auth/tokens` — mint a new PAT (`name`, `expiresIn ∈ {never, 30d, 90d, 1y}`). Plaintext returned **exactly once**. **Requires interactive `login`** — BE returns 403 `PAT_CANNOT_MINT_PAT` when called via env token. |
| `revoke_pat` | `DELETE /api/auth/tokens/:id` — revoke one of the current user's PATs. **Requires interactive `login`** (same mint guard). |

### Tenants
| Tool | What it does |
|---|---|
| `list_tenants` | All active tenants (public; pre-login picker) |
| `get_tenant` | Tenant detail by slug |
| `create_tenant` | Any authenticated user; caller becomes admin |
| `update_tenant` | Tenant admin; rename + cosmetics (slug + plan immutable) |
| `deactivate_tenant` / `reactivate_tenant` | Tenant admin lifecycle |
| `list_tenant_members` | Hydrated tenant directory; visible to any tenant member |
| `get_tenant_member` | Single user lookup by uuid (display-name fallback) |
| `admin_reset_password` | Tenant admin issues a one-time temp password for another member |
| `deactivate_user` / `reactivate_user` | Tenant admin flips another member's `isActive` flag (effective scope is global) |

### Workspaces
| Tool | What it does |
|---|---|
| `list_workspaces` / `get_workspace` | Read; supports `includeArchived` |
| `create_workspace` | Tenant admin |
| `update_workspace` | Workspace admin (slug is immutable) |
| `archive_workspace` / `unarchive_workspace` | Tenant admin |

### Projects
| Tool | What it does |
|---|---|
| `list_projects` / `get_project` | Read; both support `includeArchived` |
| `create_project` | Workspace write+ |
| `update_project` | Workspace admin (slug + key are immutable) |
| `archive_project` / `unarchive_project` | Workspace admin; archived projects block issue mutations |
| `get_project_workflows` | Per-issue-type workflow assignment |
| `set_project_workflow` | Assign a workflow slug to a (project, issueType) pair |

### Issues
| Tool | What it does |
|---|---|
| `list_issues` | Workspace-scoped or project-scoped (when `projectSlug` is set) |
| `get_issue` | Issue detail by key (e.g. `CMT-7`) |
| `create_issue` / `update_issue` | Write; honours hierarchy + workflow guards |
| `set_issue_parent` | Move an issue under a new parent (or clear) |

### Issue links
| Tool | What it does |
|---|---|
| `add_issue_relation` / `remove_issue_relation` | Symmetric `relates` link |
| `add_issue_dependency` / `remove_issue_dependency` | Directed `depends on` (Tasks; rejects cycles) |

### Comments
| Tool | What it does |
|---|---|
| `list_comments` / `create_comment` | Issue-scoped |
| `update_comment` / `delete_comment` | Workspace-scoped by comment uuid |

### Milestones
| Tool | What it does |
|---|---|
| `list_milestones` | Workspace-scoped or project-scoped (when `projectSlug` is set); workspace form accepts `projectId` filter |
| `get_milestone` | Project-scoped lookup by uuid |
| `create_milestone` / `update_milestone` / `delete_milestone` | Workspace write+; rejected on archived projects |

### Workflows
| Tool | What it does |
|---|---|
| `list_workflows` / `get_workflow` | Read |
| `create_workflow` / `update_workflow` | Write; full-replace nodes / transitions |
| `delete_workflow` | Workspace admin |

### Mentionables
| Tool | What it does |
|---|---|
| `search_mentionables` | `/mentionables/search?q=...` — users + teams |

### Workspace members
| Tool | What it does |
|---|---|
| `list_workspace_members` | Hydrated directory; visible to any workspace member |
| `add_workspace_member` | Direct-add (target must already be an active tenant member); workspace admin |
| `update_workspace_member_role` | Patch role; last-admin guard refuses demoting the only effective admin |
| `remove_workspace_member` | Workspace admin OR self-leave; cascades clear team_memberships + project_user_access |

### Teams
| Tool | What it does |
|---|---|
| `list_teams` / `get_team` | Read team CRUD with hydrated rosters |
| `create_team` / `update_team` / `delete_team` | Workspace admin (slug immutable) |
| `list_team_members` / `add_team_member` / `remove_team_member` | Roster mutations; admin-only; new members must be active workspace members |

### Project access
| Tool | What it does |
|---|---|
| `list_project_access` | Returns `{ teams[], users[] }` for a project |
| `list_project_effective_members` | Flat per-user list with provenance + viaTeams[] |
| `add_project_team_grant` / `update_project_team_grant` / `remove_project_team_grant` | Team grants (write/read; admin never inherited via team — both Zod and DB CHECK enforce) |
| `add_project_user_grant` / `update_project_user_grant` / `remove_project_user_grant` | Explicit user grants (admin/write/read); target must be an active workspace member or tenant admin |

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
