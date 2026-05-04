# BIRA MCP server

A Model Context Protocol server that wraps the BIRA backend so AI clients
(Claude Desktop, Claude Code, etc.) can log in and read/write tenants,
workspaces, and projects through tool calls.

This is a scaffold — only the endpoints that exist on the BE today are
exposed. As issues / themes / workflows land in `server/`, add matching
tools here.

## Tools

| Tool | What it does |
|---|---|
| `login` | Auth against `/api/auth/login`; cache token in process |
| `logout` | Clear the cached session |
| `profile` | `GET /api/auth/profile` |
| `list_tenants` | Tenants the user can see |
| `get_tenant` | Tenant detail by slug |
| `list_workspaces` | Workspaces in a tenant |
| `get_workspace` | Workspace detail |
| `create_workspace` | Tenant-admin only |
| `list_projects` | Projects in a workspace |
| `get_project` | Project detail |
| `create_project` | Workspace-write+ |

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
