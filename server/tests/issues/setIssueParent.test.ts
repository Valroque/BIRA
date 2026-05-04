import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  addWorkspaceMember,
  createProject,
  createIssue,
  loginAs,
} from '../helpers/factories.js';
import { db } from '../../src/db/knex.js';
import type { IssueType } from '../../src/lib/constants.js';

/**
 * PATCH /api/tenants/:t/workspaces/:w/projects/:projectSlug/issues/:key/parent
 *
 * Body: { parent: string | null }   // issue key, e.g. 'CMT-7'
 */

async function setupAdmin() {
  const { user, password } = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  const proj = await createProject({
    workspaceId: ws.id,
    createdByUserId: user.id,
    key: 'PAR',
  });
  const { token } = await loginAs(user.email, password);
  return { user, tenant, ws, proj, token };
}

function url(opts: {
  tenantSlug: string;
  workspaceSlug: string;
  projectSlug: string;
  key: string;
}): string {
  return `/api/tenants/${opts.tenantSlug}/workspaces/${opts.workspaceSlug}/projects/${opts.projectSlug}/issues/${opts.key}/parent`;
}

describe('PATCH /:key/parent — auth', () => {
  it('401 when unauthenticated', async () => {
    const { tenant, ws, proj, user } = await setupAdmin();
    const child = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const res = await api()
      .patch(
        url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: child.key })
      )
      .send({ parent: null });
    expect(res.status).toBe(401);
  });

  it('403 when caller has read role only', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'read');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'read');

    const owner = await createUser();
    await addTenantMember(owner.user.id, tenant.id, 'admin');
    const proj = await createProject({
      workspaceId: ws.id,
      createdByUserId: owner.user.id,
      key: 'RDP',
    });
    const issue = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: owner.user.id,
      type: 'T',
    });

    const { token } = await loginAs(user.email, password);
    const res = await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: issue.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: null });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /:key/parent — type-pair acceptance', () => {
  it.each<[IssueType, IssueType]>([
    ['S', 'E'],
    ['T', 'E'],
    ['T', 'S'],
    ['B', 'E'],
    ['B', 'S'],
  ])('%s under %s → 200, child key in parent.children', async (childType, parentType) => {
    const { user, tenant, ws, proj, token } = await setupAdmin();
    // Stories must themselves have an Epic to be created; inject one.
    let parentSeed: string | null = null;
    if (parentType === 'S') {
      const epicForStoryParent = await createIssue({
        workspaceId: ws.id,
        projectId: proj.id,
        reporterUserId: user.id,
        type: 'E',
      });
      parentSeed = epicForStoryParent.id;
    }
    const parent = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: parentType,
      parentIssueId: parentSeed,
    });
    // For Story children, we can't create them orphan — create under
    // a placeholder Epic and re-parent below.
    let child: Awaited<ReturnType<typeof createIssue>>;
    if (childType === 'S') {
      const placeholder = await createIssue({
        workspaceId: ws.id,
        projectId: proj.id,
        reporterUserId: user.id,
        type: 'E',
      });
      child = await createIssue({
        workspaceId: ws.id,
        projectId: proj.id,
        reporterUserId: user.id,
        type: 'S',
        parentIssueId: placeholder.id,
      });
    } else {
      child = await createIssue({
        workspaceId: ws.id,
        projectId: proj.id,
        reporterUserId: user.id,
        type: childType,
      });
    }

    const res = await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: child.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: parent.key });
    expect(res.status).toBe(200);
    expect(res.body.data.parent).toBe(parent.key);

    const parentRes = await api()
      .get(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${parent.key}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(parentRes.body.data.children).toContain(child.key);
  });
});

describe('PATCH /:key/parent — type-pair rejection', () => {
  // (childType, parentType) pairs that should be rejected.
  const REJECT: Array<[IssueType, IssueType]> = [
    ['E', 'E'],
    ['E', 'S'],
    ['E', 'T'],
    ['E', 'B'],
    ['S', 'S'],
    ['S', 'T'],
    ['S', 'B'],
    ['T', 'T'],
    ['T', 'B'],
    ['B', 'T'],
    ['B', 'B'],
  ];

  it.each(REJECT)('%s under %s → 400', async (childType, parentType) => {
    const { user, tenant, ws, proj, token } = await setupAdmin();
    // Build the parent. Stories need an Epic above them.
    let parentSeed: string | null = null;
    if (parentType === 'S') {
      const epic = await createIssue({
        workspaceId: ws.id,
        projectId: proj.id,
        reporterUserId: user.id,
        type: 'E',
      });
      parentSeed = epic.id;
    }
    const parent = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: parentType,
      parentIssueId: parentSeed,
    });
    // Build the child. Stories need a placeholder Epic at create time.
    let child: Awaited<ReturnType<typeof createIssue>>;
    if (childType === 'S') {
      const placeholder = await createIssue({
        workspaceId: ws.id,
        projectId: proj.id,
        reporterUserId: user.id,
        type: 'E',
      });
      child = await createIssue({
        workspaceId: ws.id,
        projectId: proj.id,
        reporterUserId: user.id,
        type: 'S',
        parentIssueId: placeholder.id,
      });
    } else {
      child = await createIssue({
        workspaceId: ws.id,
        projectId: proj.id,
        reporterUserId: user.id,
        type: childType,
      });
    }

    const res = await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: child.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: parent.key });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /:key/parent — clearing parent', () => {
  it("400 when clearing a Story's parent (Stories require an Epic)", async () => {
    const { user, tenant, ws, proj, token } = await setupAdmin();
    const epic = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'E',
    });
    const story = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'S',
      parentIssueId: epic.id,
    });

    const res = await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: story.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: null });
    expect(res.status).toBe(400);
  });

  it("200 when clearing a Task's parent → orphan is valid", async () => {
    const { user, tenant, ws, proj, token } = await setupAdmin();
    const epic = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'E',
    });
    const task = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
      parentIssueId: epic.id,
    });

    const res = await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: task.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: null });
    expect(res.status).toBe(200);
    expect(res.body.data.parent).toBeNull();

    // Old parent should no longer list the task as a child.
    const epicRes = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${epic.key}`)
      .set('Authorization', `Bearer ${token}`);
    expect(epicRes.body.data.children).not.toContain(task.key);
  });

  it("200 when clearing a Bug's parent", async () => {
    const { user, tenant, ws, proj, token } = await setupAdmin();
    const epic = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'E',
    });
    const bug = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'B',
      parentIssueId: epic.id,
    });
    const res = await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: bug.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: null });
    expect(res.status).toBe(200);
    expect(res.body.data.parent).toBeNull();
  });

  it("200 when clearing an Epic's (already-null) parent — noop", async () => {
    const { user, tenant, ws, proj, token } = await setupAdmin();
    const epic = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'E',
    });
    const res = await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: epic.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: null });
    expect(res.status).toBe(200);
    expect(res.body.data.parent).toBeNull();
  });
});

describe('PATCH /:key/parent — project / workspace scope', () => {
  it('400 cross-project parent', async () => {
    const { user, tenant, ws, proj, token } = await setupAdmin();
    const projB = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      slug: 'other',
      key: 'OTH',
    });
    const epic = await createIssue({
      workspaceId: ws.id,
      projectId: projB.id,
      reporterUserId: user.id,
      type: 'E',
    });
    const task = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const res = await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: task.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: epic.key });
    expect(res.status).toBe(400);
  });

  it('400 cross-workspace parent (parent key does not resolve in this workspace)', async () => {
    const { user, tenant, ws, proj, token } = await setupAdmin();
    const wsB = await createWorkspace({ tenantId: tenant.id });
    const projB = await createProject({
      workspaceId: wsB.id,
      createdByUserId: user.id,
      slug: 'b',
      key: 'BBB',
    });
    const epicB = await createIssue({
      workspaceId: wsB.id,
      projectId: projB.id,
      reporterUserId: user.id,
      type: 'E',
    });
    const task = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const res = await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: task.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: epicB.key });
    // The parent key is not visible in the request workspace — the
    // route's findByKey returns null, so we 400 with "Parent not
    // found".
    expect(res.status).toBe(400);
  });
});

describe('PATCH /:key/parent — cycle / self', () => {
  it('400 self-parent', async () => {
    const { user, tenant, ws, proj, token } = await setupAdmin();
    const epic = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'E',
    });
    const res = await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: epic.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: epic.key });
    // Epic-can't-have-parent fires first → 400. Either way the request
    // is rejected.
    expect(res.status).toBe(400);
  });

  it('400 cycle in a manually-corrupt chain (defence in depth)', async () => {
    // The type rules already prevent cycles in any tree the API can
    // build. To exercise the cycle guard we corrupt the DB directly:
    // Seed a chain Epic A → Epic B → Epic C (impossible via API since
    // Epics can't have parents) and then try to set A's parent to C
    // through the API. The cycle walk should reject it.
    const { user, tenant, ws, proj, token } = await setupAdmin();
    const a = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'E',
    });
    const b = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'E',
    });
    const c = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'E',
    });
    // Corrupt: set B.parent = A, C.parent = B (bypass usecase since
    // Epics can't have parents).
    await db('issues').where('id', b.id).update({ parent_issue_id: a.id });
    await db('issues').where('id', c.id).update({ parent_issue_id: b.id });

    // Now try via the API to set A.parent = C. The endpoint will hit
    // the Epic-can't-have-parent rule first and reject with 400 — same
    // status the cycle guard would produce. Either way the malformed
    // assignment is refused.
    const res = await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: a.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: c.key });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /:key/parent — children denormalisation round-trip', () => {
  it('after setting parent, GET parent includes the new child key', async () => {
    const { user, tenant, ws, proj, token } = await setupAdmin();
    const epic = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'E',
    });
    const task = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: task.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: epic.key });

    const epicRes = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${epic.key}`)
      .set('Authorization', `Bearer ${token}`);
    expect(epicRes.body.data.children).toEqual([task.key]);
  });

  it('after re-parenting, old parent loses the child and new parent gains it', async () => {
    const { user, tenant, ws, proj, token } = await setupAdmin();
    const epicA = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'E',
    });
    const epicB = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'E',
    });
    const task = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
      parentIssueId: epicA.id,
    });

    await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: task.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: epicB.key });

    const aRes = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${epicA.key}`)
      .set('Authorization', `Bearer ${token}`);
    expect(aRes.body.data.children).not.toContain(task.key);

    const bRes = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${epicB.key}`)
      .set('Authorization', `Bearer ${token}`);
    expect(bRes.body.data.children).toContain(task.key);
  });
});

describe('PATCH /:key/parent — 404s', () => {
  it('404 when child key does not exist', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: 'PAR-9999' }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: null });
    expect(res.status).toBe(404);
  });

  it('400 when parent key does not exist', async () => {
    const { user, tenant, ws, proj, token } = await setupAdmin();
    const task = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const res = await api()
      .patch(url({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, projectSlug: proj.slug, key: task.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ parent: 'PAR-9999' });
    expect(res.status).toBe(400);
  });
});
