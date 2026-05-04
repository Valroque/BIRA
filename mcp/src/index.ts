#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z, type ZodTypeAny } from 'zod';
import { BiraClient, type AuthState } from './client.js';

const BASE_URL = process.env.BIRA_API_URL ?? 'http://localhost:5001';
const client = new BiraClient(BASE_URL);

const server = new McpServer({ name: 'bira-mcp', version: '0.1.0' });

const ok = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
});

// Helper: registers a tool whose input shape is wrapped as z.object(...) so
// the SDK's per-field type inference doesn't blow TypeScript's complexity
// budget. The handler receives parsed, typed args.
function tool<S extends ZodTypeAny>(
  name: string,
  description: string,
  schema: S,
  handler: (args: z.infer<S>) => Promise<{ content: { type: 'text'; text: string }[] }>
): void {
  // Cast to `any` because the SDK's generic inference over the
  // zod3 | zod4 union explodes TS's complexity budget. The runtime
  // contract — schema validates input, handler gets the parsed value —
  // stays correct; we just opt out of the deep generic.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    name,
    { description, inputSchema: schema },
    async (args: unknown) => handler(schema.parse(args) as z.infer<S>)
  );
}

// ── Auth ───────────────────────────────────────────────────────────────────

tool(
  'login',
  'Log in to BIRA. Stores the access token in this MCP process for subsequent tool calls.',
  z.object({ email: z.string().email(), password: z.string().min(1) }),
  async ({ email, password }) => {
    const data = await client.request<AuthState>(
      'POST',
      '/api/auth/login',
      { email, password },
      { authed: false }
    );
    client.setAuth(data);
    return ok({ user: data.user, message: 'Logged in.' });
  }
);

tool(
  'logout',
  'Forget the cached BIRA session in this MCP process.',
  z.object({}),
  async () => {
    client.clearAuth();
    return ok({ message: 'Logged out.' });
  }
);

tool(
  'profile',
  'Get the currently logged-in BIRA user profile.',
  z.object({}),
  async () => ok(await client.request('GET', '/api/auth/profile'))
);

// ── Tenants ────────────────────────────────────────────────────────────────

tool(
  'list_tenants',
  'List tenants visible to the logged-in user. Deactivated tenants are excluded by default; pass includeDeactivated=true to see them too.',
  z.object({ includeDeactivated: z.boolean().optional() }),
  async ({ includeDeactivated }) => {
    const qs = includeDeactivated ? '?includeDeactivated=true' : '';
    return ok(await client.request('GET', `/api/tenants${qs}`));
  }
);

tool(
  'get_tenant',
  'Get a tenant by slug.',
  z.object({ tenantSlug: z.string().min(1) }),
  async ({ tenantSlug }) =>
    ok(await client.request('GET', `/api/tenants/${tenantSlug}`))
);

tool(
  'create_tenant',
  'Create a new tenant. The caller is granted admin membership on the new tenant in the same transaction. Slug must be globally unique.',
  z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    letter: z.string().min(1).max(4),
    color: z.string().min(1),
    bg: z.string().min(1),
    plan: z.string().min(1).optional(),
  }),
  async (body) => ok(await client.request('POST', '/api/tenants', body))
);

tool(
  'deactivate_tenant',
  'Deactivate a tenant. No data is destroyed; the tenant disappears from the default list until reactivated. Requires tenant admin role.',
  z.object({ tenantSlug: z.string().min(1) }),
  async ({ tenantSlug }) =>
    ok(await client.request('POST', `/api/tenants/${tenantSlug}/deactivate`))
);

tool(
  'reactivate_tenant',
  'Restore a previously deactivated tenant to active. Requires tenant admin role.',
  z.object({ tenantSlug: z.string().min(1) }),
  async ({ tenantSlug }) =>
    ok(await client.request('POST', `/api/tenants/${tenantSlug}/reactivate`))
);

// ── Workspaces ─────────────────────────────────────────────────────────────

tool(
  'list_workspaces',
  'List workspaces in a tenant that the user can see. Archived workspaces are excluded by default; pass includeArchived=true to see them too.',
  z.object({
    tenantSlug: z.string().min(1),
    includeArchived: z.boolean().optional(),
  }),
  async ({ tenantSlug, includeArchived }) => {
    const qs = includeArchived ? '?includeArchived=true' : '';
    return ok(await client.request('GET', `/api/tenants/${tenantSlug}/workspaces${qs}`));
  }
);

tool(
  'get_workspace',
  'Get a workspace by slug within a tenant. Returns { workspace, role } — workspace includes status (active/archived). Archived workspaces 404 unless includeArchived=true.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    includeArchived: z.boolean().optional(),
  }),
  async ({ tenantSlug, workspaceSlug, includeArchived }) => {
    const qs = includeArchived ? '?includeArchived=true' : '';
    return ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}${qs}`
      )
    );
  }
);

tool(
  'create_workspace',
  'Create a workspace under a tenant. Requires tenant admin role.',
  z.object({
    tenantSlug: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    letter: z.string().min(1).max(4),
    color: z.string().min(1),
    bg: z.string().min(1),
  }),
  async ({ tenantSlug, ...body }) =>
    ok(await client.request('POST', `/api/tenants/${tenantSlug}/workspaces`, body))
);

tool(
  'update_workspace',
  'Update a workspace name/letter/color/bg. Slug is immutable. Requires admin role on the workspace (tenant admins inherit).',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    name: z.string().min(1).optional(),
    letter: z.string().min(1).max(4).optional(),
    color: z.string().min(1).optional(),
    bg: z.string().min(1).optional(),
  }),
  async ({ tenantSlug, workspaceSlug, ...body }) =>
    ok(
      await client.request(
        'PATCH',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}`,
        body
      )
    )
);

tool(
  'archive_workspace',
  'Archive a workspace. No data is destroyed; the workspace becomes read-only — project and other workspace-scoped writes are blocked until it is unarchived. Requires tenant admin role.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/archive`
      )
    )
);

tool(
  'unarchive_workspace',
  'Restore a previously archived workspace to active. Requires tenant admin role.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/unarchive`
      )
    )
);

// ── Projects ───────────────────────────────────────────────────────────────

tool(
  'list_projects',
  'List projects in a workspace.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects`
      )
    )
);

tool(
  'get_project',
  'Get a project by slug within a workspace.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}`
      )
    )
);

tool(
  'create_project',
  'Create a project in a workspace. Requires write role on the workspace.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    slug: z.string().min(1),
    key: z.string().min(1).max(8),
    name: z.string().min(1),
    letter: z.string().min(1).max(4),
    color: z.string().min(1),
    bg: z.string().min(1),
    description: z.string().optional(),
    status: z.enum(['active', 'archived', 'planning']).optional(),
  }),
  async ({ tenantSlug, workspaceSlug, ...body }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects`,
        body
      )
    )
);

// ── Bootstrap ──────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
