import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  addWorkspaceMember,
  createWorkspace,
  createProject,
  createTeam,
  createIssue,
  createCommentFactory,
  createFile,
  loginAs,
} from '../helpers/factories.js';

/**
 * Archive byte-identity round-trip. Per `docs/decisions.md` Q8
 * (2026-05-08), archive is a soft-freeze: "after archive → unarchive,
 * the listed effective members, project grants, and issue counts are
 * byte-identical to pre-archive."
 *
 * This test wires a non-trivial workspace (project + team + issue
 * with parent/child + relates link + comment + file upload + user
 * grant + team grant + custom workflow), snapshots all public-API
 * reads, archives, probes that mutations are blocked, unarchives, and
 * asserts the snapshots are exactly equal. If they aren't, that's a
 * real bug — we flag, not fix.
 */

interface Snapshot {
  workspaceMembers: unknown;
  teams: unknown;
  teamMembers: Record<string, unknown>;
  projects: unknown;
  projectAccess: Record<string, unknown>;
  projectEffectiveMembers: Record<string, unknown>;
  projectWorkflows: Record<string, unknown>;
  issuesByProject: Record<string, unknown>;
  workspaceIssues: unknown;
  workspaceMilestones: unknown;
  workflowsCatalog: unknown;
  comments: Record<string, unknown>;
}

async function readSnapshot(opts: {
  tenantSlug: string;
  workspaceSlug: string;
  token: string;
  projectSlugs: string[];
  teamSlugs: string[];
  commentIssueKeys: { projectSlug: string; key: string }[];
}): Promise<Snapshot> {
  const { tenantSlug, workspaceSlug, token, projectSlugs, teamSlugs, commentIssueKeys } = opts;
  const auth = `Bearer ${token}`;
  const base = `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}`;

  const get = async (path: string) => {
    const res = await api().get(path).set('Authorization', auth);
    expect(res.status).toBe(200);
    return res.body.data;
  };

  const teamMembers: Record<string, unknown> = {};
  for (const slug of teamSlugs) {
    teamMembers[slug] = await get(`${base}/teams/${slug}/members`);
  }

  const projectAccess: Record<string, unknown> = {};
  const projectEffectiveMembers: Record<string, unknown> = {};
  const projectWorkflows: Record<string, unknown> = {};
  const issuesByProject: Record<string, unknown> = {};
  for (const slug of projectSlugs) {
    projectAccess[slug] = await get(`${base}/projects/${slug}/access`);
    projectEffectiveMembers[slug] = await get(`${base}/projects/${slug}/access/effective-members`);
    projectWorkflows[slug] = await get(`${base}/projects/${slug}/workflows`);
    issuesByProject[slug] = await get(`${base}/projects/${slug}/issues`);
  }

  const comments: Record<string, unknown> = {};
  for (const { projectSlug, key } of commentIssueKeys) {
    comments[`${projectSlug}/${key}`] = await get(`${base}/projects/${projectSlug}/issues/${key}/comments`);
  }

  return {
    workspaceMembers: await get(`${base}/members`),
    teams: await get(`${base}/teams`),
    teamMembers,
    projects: await get(`${base}/projects`),
    projectAccess,
    projectEffectiveMembers,
    projectWorkflows,
    issuesByProject,
    workspaceIssues: await get(`${base}/issues`),
    workspaceMilestones: await get(`${base}/milestones`),
    workflowsCatalog: await get(`${base}/workflows`),
    comments,
  };
}

/**
 * Volatile fields strip. Some response fields move on every read by
 * design (Issue.updatedAt is bumped by `select-for-anything`-style
 * touches; descriptionAttachments[].readUrl is a presigned pointer).
 * This test is asserting that DATA shape and content survive the
 * round-trip, not that timestamps freeze. We strip those before the
 * deep equality.
 *
 * If a future refactor changes which fields are volatile, this list is
 * the right place to update — keep it small and explicit so a real
 * regression is still caught.
 */
function stripVolatile<T>(v: T): T {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(stripVolatile) as unknown as T;
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      // updatedAt is bumped on the workspace itself by setStatus —
      // archiving and unarchiving each touch it. The data we care
      // about (the listed members, issues, workflows, grants) does
      // NOT change, but `lastSeenAt` on workspace_memberships and
      // similar timestamps may shift if the test does an
      // intervening read. Strip them defensively.
      if (
        k === 'updatedAt' ||
        k === 'lastSeenAt' ||
        k === 'lastUsedAt' ||
        k === 'readUrl'
      ) {
        continue;
      }
      out[k] = stripVolatile(val);
    }
    return out as unknown as T;
  }
  return v;
}

describe('Workspace archive byte-identity', () => {
  it('archive → unarchive restores every public-API read byte-identically', async () => {
    // ── Setup: tenant admin + a second workspace member ──────────────────
    const { user: adminUser, password: adminPwd } = await createUser({ email: `admin-${Date.now()}@test.local` });
    const tenant = await createTenant();
    await addTenantMember(adminUser.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(adminUser.email, adminPwd);

    // Second member of the workspace, granted at the workspace level.
    const second = await createUser();
    await addTenantMember(second.user.id, tenant.id, 'write');
    await addWorkspaceMember(second.user.id, ws.id, 'write');

    // ── Project + team ───────────────────────────────────────────────────
    const proj = await createProject({
      workspaceId: ws.id,
      createdByUserId: adminUser.id,
      key: 'BYT',
      slug: 'byte-proj',
    });
    const team = await createTeam({
      workspaceId: ws.id,
      createdByUserId: adminUser.id,
      slug: 'byte-team',
    });

    // Add `second` to the team (must already be workspace member).
    {
      const res = await api()
        .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/teams/${team.slug}/members`)
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: second.user.id });
      expect([200, 201]).toContain(res.status);
    }

    // ── Project grants: one team grant + one explicit user grant ────────
    {
      const teamGrant = await api()
        .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/access/teams`)
        .set('Authorization', `Bearer ${token}`)
        .send({ teamId: team.id, role: 'write' });
      expect(teamGrant.status).toBe(201);

      const userGrant = await api()
        .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/access/users`)
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: second.user.id, role: 'write' });
      expect(userGrant.status).toBe(201);
    }

    // ── Custom workflow with a transition rule, assigned to (proj, T) ───
    let workflowId: string;
    {
      const created = await api()
        .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/workflows`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          slug: 'byte-flow',
          name: 'Byte flow',
          nodes: [
            { statusId: 'backlog', x: 0, y: 0, isInitial: true },
            { statusId: 'todo', x: 100, y: 0 },
          ],
        });
      expect(created.status).toBe(201);
      workflowId = created.body.data.id;
      const [n0, n1] = created.body.data.nodes as Array<{ id: string; statusId: string }>;
      const patched = await api()
        .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/workflows/byte-flow`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          nodes: [
            { id: n0.id, statusId: 'backlog', x: 0, y: 0, isInitial: true },
            { id: n1.id, statusId: 'todo', x: 100, y: 0 },
          ],
          transitions: [
            {
              fromNodeId: n0.id,
              toNodeId: n1.id,
              label: 'start',
              rules: [{ type: 'role', params: { role: 'write' } }],
            },
          ],
        });
      expect(patched.status).toBe(200);

      const assign = await api()
        .put(
          `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/workflows/T`
        )
        .set('Authorization', `Bearer ${token}`)
        .send({ workflowSlug: 'byte-flow' });
      expect(assign.status).toBe(200);
    }
    void workflowId;

    // ── Issue tree: Epic → Task (parent/child) + a sibling Task linked
    //   via `relates`. Plus a comment + a file upload referenced by
    //   the comment.
    const epic = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: adminUser.id,
      type: 'E',
      title: 'Byte epic',
    });
    const child = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: adminUser.id,
      type: 'T',
      title: 'Byte child task',
      parentIssueId: epic.id,
    });
    const sibling = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: adminUser.id,
      type: 'T',
      title: 'Byte sibling task',
    });
    // relates link between child and sibling.
    {
      const rel = await api()
        .post(
          `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${child.key}/relates`
        )
        .set('Authorization', `Bearer ${token}`)
        .send({ relatedKey: sibling.key });
      expect(rel.status).toBe(200);
    }

    const file = await createFile({
      tenantId: tenant.id,
      workspaceId: ws.id,
      uploaderUserId: adminUser.id,
    });
    const comment = await createCommentFactory({
      workspaceId: ws.id,
      tenantId: tenant.id,
      issueId: child.id,
      authorUserId: adminUser.id,
      body: `See attachment: attachment:${file.id}`,
      attachmentIds: [`attachment:${file.id}`],
    });
    void comment;

    // ── Snapshot BEFORE ──────────────────────────────────────────────────
    const before = await readSnapshot({
      tenantSlug: tenant.slug,
      workspaceSlug: ws.slug,
      token,
      projectSlugs: [proj.slug],
      teamSlugs: [team.slug],
      commentIssueKeys: [{ projectSlug: proj.slug, key: child.key }],
    });

    // ── Archive ──────────────────────────────────────────────────────────
    {
      const res = await api()
        .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('archived');
    }

    // ── Probe writes are blocked ─────────────────────────────────────────
    {
      const createIssueAttempt = await api()
        .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'T', title: 'should fail' });
      expect(createIssueAttempt.status).toBe(409);

      const createCommentAttempt = await api()
        .post(
          `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${child.key}/comments`
        )
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'should fail' });
      expect(createCommentAttempt.status).toBe(409);
    }

    // ── Unarchive ────────────────────────────────────────────────────────
    {
      const res = await api()
        .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/unarchive`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    }

    // ── Snapshot AFTER ───────────────────────────────────────────────────
    const after = await readSnapshot({
      tenantSlug: tenant.slug,
      workspaceSlug: ws.slug,
      token,
      projectSlugs: [proj.slug],
      teamSlugs: [team.slug],
      commentIssueKeys: [{ projectSlug: proj.slug, key: child.key }],
    });

    // ── Equality check (volatile fields stripped) ────────────────────────
    expect(stripVolatile(after)).toEqual(stripVolatile(before));
  });
});
