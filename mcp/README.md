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
| `login` | Auth against `/api/auth/login`; cache token in process |
| `logout` | Clear the cached session |
| `profile` | `GET /api/auth/profile` |
| `update_profile` | `PATCH /api/auth/me` (firstName / lastName / email / phone / avatar) |
| `change_password` | Self-service password change; required to clear `mustResetPassword` |
| `refresh_token` | Exchange a refresh token for a new access token |

### Tenants
| Tool | What it does |
|---|---|
| `list_tenants` | All active tenants (public; pre-login picker) |
| `get_tenant` | Tenant detail by slug |
| `create_tenant` | Any authenticated user; caller becomes admin |
| `deactivate_tenant` / `reactivate_tenant` | Tenant admin lifecycle |
| `list_tenant_members` | Hydrated tenant directory; visible to any tenant member |
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
      "env": { "BIRA_API_URL": "http://localhost:5001" }
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

## Auth model

State is per-process: each MCP client gets its own server instance with
its own token cache. There's no persistence — restarting the MCP
connection means logging in again.

The seeded demo user is `jordan@acme.com` / `password123` (see
`server/db/seeds/01_demo.ts`).
