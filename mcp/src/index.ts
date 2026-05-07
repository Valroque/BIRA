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

tool(
  'whoami',
  'Return the BIRA user this MCP process is currently acting as. Use this to confirm identity — especially when the credential came from the BIRA_API_TOKEN env var (PAT) and there was no interactive `login` call. Wraps GET /api/auth/profile and returns the user object verbatim.',
  z.object({}),
  async () => ok(await client.request('GET', '/api/auth/profile'))
);

tool(
  'update_profile',
  'Update the current user profile. At least one of firstName / lastName / email / phone / avatar must be provided. phone and avatar accept null to clear.',
  z.object({
    firstName: z.string().min(1).max(128).optional(),
    lastName: z.string().min(1).max(128).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).max(32).nullable().optional(),
    avatar: z.string().max(512).nullable().optional(),
  }),
  async (body) => ok(await client.request('PATCH', '/api/auth/me', body))
);

tool(
  'change_password',
  'Change the current user password. Required when the account is locked with mustResetPassword=true. New password must be ≥ 8 chars and differ from the current one.',
  z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  }),
  async (body) => ok(await client.request('POST', '/api/auth/change-password', body))
);

tool(
  'refresh_token',
  'Exchange a refresh token for a new access token. Public endpoint — no Bearer auth required.',
  z.object({ refreshToken: z.string().min(1) }),
  async (body) =>
    ok(await client.request('POST', '/api/auth/refresh-token', body, { authed: false }))
);

tool(
  'register',
  'Register a new user. Public — no Bearer auth required. The created user has no tenant or workspace memberships; grant them via add_workspace_member after the tenant admin has already been added (tenant membership is created automatically when the user is granted into a workspace via that flow). Email must be unique. Returns the new user plus access + refresh tokens.',
  z.object({
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().min(1).max(128),
    lastName: z.string().min(1).max(128),
  }),
  async (body) =>
    ok(await client.request('POST', '/api/auth/register', body, { authed: false }))
);

// ── Personal access tokens ────────────────────────────────────────────────
//
// CRUD wrappers around POST/GET/DELETE /api/auth/tokens. The mint guard
// (BE returns 403 PAT_CANNOT_MINT_PAT) means `create_pat` and `revoke_pat`
// only work when the MCP process is JWT-authed via the `login` tool — a
// PAT cannot mint or revoke other PATs. `list_pats` works under either
// credential.

tool(
  'list_pats',
  "List the current user's personal access tokens. The response NEVER includes the secret — only metadata (id, name, last4, createdAt, lastUsedAt, expiresAt, revokedAt). Active rows first, then revoked rows for audit context.",
  z.object({}),
  async () => ok(await client.request('GET', '/api/auth/tokens'))
);

tool(
  'create_pat',
  "Mint a new personal access token for the current user. Requires interactive `login` first — cannot be called via env token; the BE returns 403 PAT_CANNOT_MINT_PAT in that case. The plaintext secret is returned EXACTLY ONCE in the response and cannot be retrieved later — copy it immediately. Cap is 10 active (non-revoked, non-expired) tokens per user; the 11th attempt returns 422 PAT_LIMIT_REACHED.",
  z.object({
    name: z.string().min(1).max(64),
    expiresIn: z.enum(['never', '30d', '90d', '1y']),
  }),
  async (body) => ok(await client.request('POST', '/api/auth/tokens', body))
);

tool(
  'revoke_pat',
  "Revoke one of the current user's personal access tokens by id. Requires interactive `login` first — cannot be called via env token; the BE returns 403 PAT_CANNOT_MINT_PAT in that case. Idempotent-ish: an unknown id, another user's token id, or an already-revoked token all return 404 PAT_NOT_FOUND.",
  z.object({
    tokenId: z.string().uuid(),
  }),
  async ({ tokenId }) =>
    ok(await client.request('DELETE', `/api/auth/tokens/${tokenId}`))
);

// ── Tenants ────────────────────────────────────────────────────────────────

tool(
  'list_tenants',
  'List all active tenants. Public — returns the same rows regardless of caller. Deactivated tenants are excluded.',
  z.object({}),
  async () => ok(await client.request('GET', '/api/tenants', undefined, { authed: false }))
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

tool(
  'update_tenant',
  'Update a tenant (name / letter / color / bg). Slug + plan are immutable. Tenant admin only; rejected on deactivated tenants.',
  z.object({
    tenantSlug: z.string().min(1),
    name: z.string().min(1).max(255).optional(),
    letter: z.string().min(1).max(4).optional(),
    color: z.string().min(1).max(16).optional(),
    bg: z.string().min(1).max(16).optional(),
  }),
  async ({ tenantSlug, ...body }) =>
    ok(await client.request('PATCH', `/api/tenants/${tenantSlug}`, body))
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
  'List projects in a workspace. Pass includeArchived=true to also surface frozen projects.',
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
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects${qs}`
      )
    );
  }
);

tool(
  'get_project',
  'Get a project by slug within a workspace. Archived projects 404 unless includeArchived=true.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    includeArchived: z.boolean().optional(),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, includeArchived }) => {
    const qs = includeArchived ? '?includeArchived=true' : '';
    return ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}${qs}`
      )
    );
  }
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

tool(
  'update_project',
  'Update a project (name/letter/color/bg/description). Slug + key are immutable. Requires admin role on the workspace (tenant admins inherit).',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    name: z.string().min(1).optional(),
    letter: z.string().min(1).max(4).optional(),
    color: z.string().min(1).optional(),
    bg: z.string().min(1).optional(),
    description: z.string().optional(),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, ...body }) =>
    ok(
      await client.request(
        'PATCH',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}`,
        body
      )
    )
);

tool(
  'archive_project',
  'Archive a project. No data is destroyed; the project becomes read-only — issue create/update, links, parent changes, and comments are blocked until it is unarchived. Requires admin role on the workspace.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/archive`
      )
    )
);

tool(
  'unarchive_project',
  'Restore a previously archived project to active. Requires admin role on the workspace.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/unarchive`
      )
    )
);

tool(
  'list_tenant_members',
  'List members of a tenant with hydrated user details (id, email, displayName, firstName, lastName, avatar, isActive, role, status, lastSeenAt). Sorted alphabetically by display name. Open to any tenant member (read+).',
  z.object({
    tenantSlug: z.string().min(1),
  }),
  async ({ tenantSlug }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/members`
      )
    )
);

tool(
  'get_tenant_member',
  'Get a single tenant member by user uuid. Powers UUID-fallback display-name resolution for users not in the current workspace directory. Open to any tenant member (read+).',
  z.object({
    tenantSlug: z.string().min(1),
    userId: z.string().uuid(),
  }),
  async ({ tenantSlug, userId }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/members/${userId}`
      )
    )
);

tool(
  'add_tenant_member',
  'Add a registered user to a tenant. Direct-add — the target must already exist as a user (no invite-token flow in v1). Idempotent on already-active members; reactivates rows in `invited` / `deactivated` state with the new role. Tenant admin only. Note: tenant admin role is only ever explicit-on-user, never team-derived.',
  z.object({
    tenantSlug: z.string().min(1),
    userId: z.string().uuid(),
    role: z.enum(['admin', 'write', 'read']),
  }),
  async ({ tenantSlug, ...body }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/members`,
        body
      )
    )
);

tool(
  'update_tenant_member_role',
  "Update a tenant member's role. Last-admin guard refuses demoting the only active admin. Tenant admin only.",
  z.object({
    tenantSlug: z.string().min(1),
    userId: z.string().uuid(),
    role: z.enum(['admin', 'write', 'read']),
  }),
  async ({ tenantSlug, userId, role }) =>
    ok(
      await client.request(
        'PATCH',
        `/api/tenants/${tenantSlug}/members/${userId}`,
        { role }
      )
    )
);

tool(
  'remove_tenant_member',
  'Remove a tenant member. Tenant admin OR the target themselves (self-leave). Last-admin guard applies. Cascades clear workspace_memberships, team_memberships, and project_user_access for this user across the entire tenant in the same transaction.',
  z.object({
    tenantSlug: z.string().min(1),
    userId: z.string().uuid(),
  }),
  async ({ tenantSlug, userId }) =>
    ok(
      await client.request(
        'DELETE',
        `/api/tenants/${tenantSlug}/members/${userId}`
      )
    )
);

tool(
  'admin_reset_password',
  'Tenant admin generates a temporary password for another member. The plaintext is returned exactly once — share it OOB. The target user must call change_password before they can interact with tenant data.',
  z.object({
    tenantSlug: z.string().min(1),
    userId: z.string().uuid(),
  }),
  async ({ tenantSlug, userId }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/members/${userId}/reset-password`
      )
    )
);

tool(
  'deactivate_user',
  "Tenant admin flips another member's isActive flag to false. Effective scope is global (the user can't log in to ANY tenant), but the gate is tenant-admin — the target must be an active member of this tenant. Existing sessions are rejected on the next request. Self-target → 400.",
  z.object({
    tenantSlug: z.string().min(1),
    userId: z.string().uuid(),
  }),
  async ({ tenantSlug, userId }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/members/${userId}/deactivate`
      )
    )
);

tool(
  'reactivate_user',
  'Tenant admin restores a previously deactivated user. Same scope rules as deactivate_user.',
  z.object({
    tenantSlug: z.string().min(1),
    userId: z.string().uuid(),
  }),
  async ({ tenantSlug, userId }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/members/${userId}/reactivate`
      )
    )
);

// ── Issues ─────────────────────────────────────────────────────────────────

const ISSUE_TYPE = z.enum(['T', 'B', 'S', 'E']);
const STATUS = z.enum(['backlog', 'todo', 'in-progress', 'in-review', 'done', 'canceled']);
const PRIORITY = z.enum(['urgent', 'high', 'med', 'low', 'none']);
const ISSUE_KEY = z.string().regex(/^[A-Z0-9]+-\d+$/, 'Issue key must look like CMT-7');
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

tool(
  'list_issues',
  'List issues. Pass projectSlug to scope to one project; omit it to list across the whole workspace. Optional filters: status, type, assigneeUserId, label, priority. The workspace-scoped form additionally accepts projectId.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1).optional(),
    status: STATUS.optional(),
    type: ISSUE_TYPE.optional(),
    assigneeUserId: z.string().uuid().optional(),
    label: z.string().min(1).max(64).optional(),
    priority: PRIORITY.optional(),
    projectId: z.string().uuid().optional(),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, ...filters }) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined) qs.set(k, String(v));
    }
    const query = qs.toString() ? `?${qs.toString()}` : '';
    const path = projectSlug
      ? `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues${query}`
      : `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/issues${query}`;
    return ok(await client.request('GET', path));
  }
);

tool(
  'get_issue',
  'Get a single issue by key (e.g. CMT-7) within a project.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    key: ISSUE_KEY,
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, key }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}`
      )
    )
);

tool(
  'create_issue',
  'Create an issue under a project. Workspace write+. Stories require an Epic parent. Schedules (start/end/estimate) are only valid on Tasks/Bugs. `assigneeUserId` and `teamId` are mutually exclusive — passing both non-null is a 400; both null is allowed (Unscheduled).',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    type: ISSUE_TYPE,
    title: z.string().min(1).max(500),
    description: z.string().max(50_000).nullable().optional(),
    status: STATUS.optional(),
    priority: PRIORITY.optional(),
    labels: z.array(z.string().min(1).max(64)).max(64).optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
    teamId: z.string().uuid().nullable().optional(),
    parent: ISSUE_KEY.nullable().optional(),
    startDate: ISO_DATE.nullable().optional(),
    endDate: ISO_DATE.nullable().optional(),
    estimate: z.number().int().nonnegative().nullable().optional(),
    descriptionAttachmentIds: z.array(z.string()).max(20).optional(),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, ...body }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues`,
        body
      )
    )
);

tool(
  'update_issue',
  'Update an issue by key. At least one field is required. Status changes are validated against the project workflow. `assigneeUserId` and `teamId` are mutually exclusive: setting one to a non-null value automatically clears the other on the same write. Passing both non-null in one patch is a 400. Explicit `null` clears that field WITHOUT touching the other.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    key: ISSUE_KEY,
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(50_000).nullable().optional(),
    status: STATUS.optional(),
    priority: PRIORITY.optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
    teamId: z.string().uuid().nullable().optional(),
    labels: z.array(z.string().min(1).max(64)).max(64).optional(),
    startDate: ISO_DATE.nullable().optional(),
    endDate: ISO_DATE.nullable().optional(),
    estimate: z.number().int().nonnegative().nullable().optional(),
    descriptionAttachmentIds: z.array(z.string()).max(20).optional(),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, key, ...body }) =>
    ok(
      await client.request(
        'PATCH',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}`,
        body
      )
    )
);

tool(
  'set_issue_parent',
  'Move an issue under a new parent (or clear with parent=null). Hierarchy rules apply: Epics are top-level, Stories require an Epic parent, Tasks/Bugs are leaves.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    key: ISSUE_KEY,
    parent: ISSUE_KEY.nullable(),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, key, parent }) =>
    ok(
      await client.request(
        'PATCH',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}/parent`,
        { parent }
      )
    )
);

// ── Issue links ────────────────────────────────────────────────────────────

tool(
  'add_issue_relation',
  'Add a symmetric `relates` link between two issues in the same workspace.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    key: ISSUE_KEY,
    relatedKey: ISSUE_KEY,
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, key, relatedKey }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}/relates`,
        { relatedKey }
      )
    )
);

tool(
  'remove_issue_relation',
  'Remove a `relates` link between two issues.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    key: ISSUE_KEY,
    relatedKey: ISSUE_KEY,
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, key, relatedKey }) =>
    ok(
      await client.request(
        'DELETE',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}/relates/${relatedKey}`
      )
    )
);

tool(
  'add_issue_dependency',
  'Mark an issue as depending on another (Task-only). The depender (`key`) cannot start until the blocker (`blockerKey`) ends. Cycles are rejected.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    key: ISSUE_KEY,
    blockerKey: ISSUE_KEY,
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, key, blockerKey }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}/dependencies`,
        { blockerKey }
      )
    )
);

tool(
  'remove_issue_dependency',
  'Remove a `depends on` edge.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    key: ISSUE_KEY,
    blockerKey: ISSUE_KEY,
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, key, blockerKey }) =>
    ok(
      await client.request(
        'DELETE',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}/dependencies/${blockerKey}`
      )
    )
);

// ── Comments ───────────────────────────────────────────────────────────────

tool(
  'list_comments',
  'List comments on an issue, oldest first.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    key: ISSUE_KEY,
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, key }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}/comments`
      )
    )
);

tool(
  'create_comment',
  'Add a comment to an issue. Up to 10 attachment refs (attachment:<uuid>) per comment.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    key: ISSUE_KEY,
    body: z.string().min(1).max(50_000),
    attachmentIds: z.array(z.string()).max(10).optional(),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, key, ...body }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}/comments`,
        body
      )
    )
);

tool(
  'update_comment',
  'Edit a comment. At least one of body or attachmentIds must be provided.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    commentId: z.string().uuid(),
    body: z.string().min(1).max(50_000).optional(),
    attachmentIds: z.array(z.string()).max(10).optional(),
  }),
  async ({ tenantSlug, workspaceSlug, commentId, ...body }) =>
    ok(
      await client.request(
        'PATCH',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/comments/${commentId}`,
        body
      )
    )
);

tool(
  'delete_comment',
  'Delete a comment. Author or workspace admin only.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    commentId: z.string().uuid(),
  }),
  async ({ tenantSlug, workspaceSlug, commentId }) =>
    ok(
      await client.request(
        'DELETE',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/comments/${commentId}`
      )
    )
);

// ── Milestones ────────────────────────────────────────────────────────────

tool(
  'list_milestones',
  'List milestones. Pass projectSlug to scope to one project; omit it to list across the whole workspace. The workspace-scoped form additionally accepts projectId (uuid) as a filter.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1).optional(),
    projectId: z.string().uuid().optional(),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, projectId }) => {
    const path = projectSlug
      ? `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/milestones`
      : `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/milestones${projectId ? `?projectId=${projectId}` : ''}`;
    return ok(await client.request('GET', path));
  }
);

tool(
  'get_milestone',
  "Get a milestone by uuid. The URL must match the milestone's project — a milestone uuid that lives in the same workspace but on a different project 404s.",
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    milestoneId: z.string().uuid(),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, milestoneId }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/milestones/${milestoneId}`
      )
    )
);

tool(
  'create_milestone',
  'Create a milestone under a project. Workspace write+; rejected if the project is archived.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    date: ISO_DATE,
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, ...body }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/milestones`,
        body
      )
    )
);

tool(
  'update_milestone',
  'Update a milestone (name / description / date). At least one field required. Workspace write+; rejected if the project is archived.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    milestoneId: z.string().uuid(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    date: ISO_DATE.optional(),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, milestoneId, ...body }) =>
    ok(
      await client.request(
        'PATCH',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/milestones/${milestoneId}`,
        body
      )
    )
);

tool(
  'delete_milestone',
  'Delete a milestone. Workspace write+; rejected if the project is archived.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    milestoneId: z.string().uuid(),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, milestoneId }) =>
    ok(
      await client.request(
        'DELETE',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/milestones/${milestoneId}`
      )
    )
);

// ── Workflows ──────────────────────────────────────────────────────────────

const RULE_TYPE = z.enum(['role', 'assignee_only', 'reporter_only', 'required_fields', 'not_self']);
const NodeInput = z.object({
  // Optional client-supplied uuid. Preserved verbatim on PATCH so
  // transitions in the same payload can reference existing nodes;
  // omit on fresh nodes — BE mints one.
  id: z.string().uuid().optional(),
  statusId: STATUS,
  x: z.number().int(),
  y: z.number().int(),
  isInitial: z.boolean().optional(),
  isTerminal: z.boolean().optional(),
});
const RuleInput = z.object({
  type: RULE_TYPE,
  params: z.unknown().nullable().optional(),
});
const TransitionInput = z.object({
  fromNodeId: z.string().uuid(),
  toNodeId: z.string().uuid(),
  label: z.string().max(64).nullable().optional(),
  dashed: z.boolean().optional(),
  rules: z.array(RuleInput).max(32).optional(),
});

tool(
  'list_workflows',
  'List workflows in a workspace.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/workflows`
      )
    )
);

tool(
  'get_workflow',
  'Get a workflow with its nodes, transitions, and transition rules.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    workflowSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug, workflowSlug }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/workflows/${workflowSlug}`
      )
    )
);

tool(
  'create_workflow',
  'Create a workflow. Nodes are inserted first; pass transition fromNodeId/toNodeId in a follow-up update once node ids are known, OR omit transitions entirely on first create.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    slug: z.string().min(1).max(64),
    name: z.string().min(1).max(255),
    description: z.string().max(2000).nullable().optional(),
    nodes: z.array(NodeInput).min(1).max(32),
    transitions: z.array(TransitionInput).max(128).optional(),
  }),
  async ({ tenantSlug, workspaceSlug, ...body }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/workflows`,
        body
      )
    )
);

tool(
  'update_workflow',
  'Replace a workflow definition. Pass nodes and/or transitions to fully replace those sets; pass name/description to rename. Each node may carry an optional id (uuid) — supply existing node ids to preserve them across the full-replace so transitions in the same call can reference them; omit id on new nodes and the BE mints one.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    workflowSlug: z.string().min(1),
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).nullable().optional(),
    nodes: z.array(NodeInput).min(1).max(32).optional(),
    transitions: z.array(TransitionInput).max(128).optional(),
  }),
  async ({ tenantSlug, workspaceSlug, workflowSlug, ...body }) =>
    ok(
      await client.request(
        'PATCH',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/workflows/${workflowSlug}`,
        body
      )
    )
);

tool(
  'delete_workflow',
  'Delete a workflow. Workspace admin only.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    workflowSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug, workflowSlug }) =>
    ok(
      await client.request(
        'DELETE',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/workflows/${workflowSlug}`
      )
    )
);

// ── Project ↔ workflow assignments ────────────────────────────────────────

tool(
  'get_project_workflows',
  'Return the per-issue-type workflow assignment for a project.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/workflows`
      )
    )
);

tool(
  'set_project_workflow',
  'Assign a workflow to a (project, issueType) pair. issueType is one of T/B/S/E.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    issueType: ISSUE_TYPE,
    workflowSlug: z.string().min(1).max(64),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, issueType, workflowSlug }) =>
    ok(
      await client.request(
        'PUT',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/workflows/${issueType}`,
        { workflowSlug }
      )
    )
);

// ── Mentionables ──────────────────────────────────────────────────────────

tool(
  'search_mentionables',
  'Search for @-mention candidates in a workspace. v1: users only — passing types=[\'team\'] returns 501 until workspace_teams ships.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    q: z.string().min(1),
    types: z.array(z.enum(['user', 'team'])).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  async ({ tenantSlug, workspaceSlug, q, types, limit }) => {
    const qs = new URLSearchParams({ q });
    if (types && types.length > 0) qs.set('types', types.join(','));
    if (limit !== undefined) qs.set('limit', String(limit));
    return ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/mentionables/search?${qs.toString()}`
      )
    );
  }
);

// NOTE: file upload + download are intentionally not exposed via MCP.
// Multipart upload and binary streaming don't fit the JSON-text envelope,
// and most MCP clients don't have a clean way to hand off a file. Use the
// HTTP API directly for /api/tenants/:t/workspaces/:w/files.

// ── Workspace members ─────────────────────────────────────────────────────

const ROLE = z.enum(['admin', 'write', 'read']);

tool(
  'list_workspace_members',
  'List members of a workspace with hydrated user details and tenant-admin flags. Open to any workspace member.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/members`
      )
    )
);

tool(
  'add_workspace_member',
  'Add a user to a workspace. Direct-add only — the target must already be an active tenant member (400 otherwise). Workspace admin only.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    userId: z.string().uuid(),
    role: ROLE,
  }),
  async ({ tenantSlug, workspaceSlug, ...body }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/members`,
        body
      )
    )
);

tool(
  'update_workspace_member_role',
  "Update a workspace member's role. Last-admin guard refuses demoting the only effective admin. Workspace admin only.",
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    membershipId: z.string().uuid(),
    role: ROLE,
  }),
  async ({ tenantSlug, workspaceSlug, membershipId, role }) =>
    ok(
      await client.request(
        'PATCH',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/members/${membershipId}`,
        { role }
      )
    )
);

tool(
  'remove_workspace_member',
  'Remove a workspace member. Workspace admin OR the target themselves (self-leave). Last-admin guard applies. Cascades clear team_memberships and project_user_access for this user in this workspace.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    membershipId: z.string().uuid(),
  }),
  async ({ tenantSlug, workspaceSlug, membershipId }) =>
    ok(
      await client.request(
        'DELETE',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/members/${membershipId}`
      )
    )
);

// ── Teams ─────────────────────────────────────────────────────────────────

tool(
  'list_teams',
  'List teams in a workspace. Each entry includes memberCount and a hydrated members[] roster.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/teams`
      )
    )
);

tool(
  'create_team',
  'Create a team in a workspace. Slug is workspace-unique and immutable. Workspace admin only.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    slug: z.string().min(1).max(64),
    name: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    color: z.string().min(1).max(16),
  }),
  async ({ tenantSlug, workspaceSlug, ...body }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/teams`,
        body
      )
    )
);

tool(
  'get_team',
  'Get a team by slug, hydrated with members.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    teamSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug, teamSlug }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/teams/${teamSlug}`
      )
    )
);

tool(
  'update_team',
  'Update a team (name / description / color). Slug is immutable. Workspace admin only.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    teamSlug: z.string().min(1),
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).optional(),
    color: z.string().min(1).max(16).optional(),
  }),
  async ({ tenantSlug, workspaceSlug, teamSlug, ...body }) =>
    ok(
      await client.request(
        'PATCH',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/teams/${teamSlug}`,
        body
      )
    )
);

tool(
  'delete_team',
  'Delete a team. CASCADE removes team_memberships and project_team_access rows. Workspace admin only.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    teamSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug, teamSlug }) =>
    ok(
      await client.request(
        'DELETE',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/teams/${teamSlug}`
      )
    )
);

tool(
  'list_team_members',
  'List the roster of a team.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    teamSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug, teamSlug }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/teams/${teamSlug}/members`
      )
    )
);

tool(
  'add_team_member',
  'Add a user to a team. The target must be an active workspace member (400 otherwise). Workspace admin only.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    teamSlug: z.string().min(1),
    userId: z.string().uuid(),
  }),
  async ({ tenantSlug, workspaceSlug, teamSlug, userId }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/teams/${teamSlug}/members`,
        { userId }
      )
    )
);

tool(
  'remove_team_member',
  'Remove a user from a team. Workspace admin only.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    teamSlug: z.string().min(1),
    userId: z.string().uuid(),
  }),
  async ({ tenantSlug, workspaceSlug, teamSlug, userId }) =>
    ok(
      await client.request(
        'DELETE',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/teams/${teamSlug}/members/${userId}`
      )
    )
);

// ── Project access ────────────────────────────────────────────────────────

const TEAM_GRANT_ROLE = z.enum(['write', 'read']); // admin never inherited via team

tool(
  'list_project_access',
  'List project access grants — `teams` (with memberCount) and `users` (with hydrated user details).',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/access`
      )
    )
);

tool(
  'list_project_effective_members',
  'List effective project members with provenance. Provenance precedence: explicit-user > tenant-admin > workspace-admin > team. Team-derived entries include viaTeams[].',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug }) =>
    ok(
      await client.request(
        'GET',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/access/effective-members`
      )
    )
);

tool(
  'add_project_team_grant',
  'Grant a team access to a project (write or read — admin is never inherited via teams). Workspace admin only.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    teamId: z.string().uuid(),
    role: TEAM_GRANT_ROLE,
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, ...body }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/access/teams`,
        body
      )
    )
);

tool(
  'update_project_team_grant',
  "Change a team's project role (write ↔ read). Workspace admin only.",
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    teamId: z.string().uuid(),
    role: TEAM_GRANT_ROLE,
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, teamId, role }) =>
    ok(
      await client.request(
        'PATCH',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/access/teams/${teamId}`,
        { role }
      )
    )
);

tool(
  'remove_project_team_grant',
  'Revoke a team grant. Workspace admin only.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    teamId: z.string().uuid(),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, teamId }) =>
    ok(
      await client.request(
        'DELETE',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/access/teams/${teamId}`
      )
    )
);

tool(
  'add_project_user_grant',
  'Grant an explicit user access to a project. Target must be an active workspace member (or a tenant admin). Roles: admin / write / read. Workspace admin only.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    userId: z.string().uuid(),
    role: ROLE,
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, ...body }) =>
    ok(
      await client.request(
        'POST',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/access/users`,
        body
      )
    )
);

tool(
  'update_project_user_grant',
  "Change an explicit user's project role. Workspace admin only.",
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    userId: z.string().uuid(),
    role: ROLE,
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, userId, role }) =>
    ok(
      await client.request(
        'PATCH',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/access/users/${userId}`,
        { role }
      )
    )
);

tool(
  'remove_project_user_grant',
  'Revoke an explicit user grant. Workspace admin only.',
  z.object({
    tenantSlug: z.string().min(1),
    workspaceSlug: z.string().min(1),
    projectSlug: z.string().min(1),
    userId: z.string().uuid(),
  }),
  async ({ tenantSlug, workspaceSlug, projectSlug, userId }) =>
    ok(
      await client.request(
        'DELETE',
        `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/access/users/${userId}`
      )
    )
);

// ── Bootstrap ──────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
