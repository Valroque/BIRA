import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  addWorkspaceMember,
  createProject,
  loginAs,
} from '../helpers/factories.js';

const baseBody = {
  type: 'T',
  title: 'Wire up the doohickey',
};

async function setupAdmin(): Promise<{
  user: Awaited<ReturnType<typeof createUser>>;
  tenant: Awaited<ReturnType<typeof createTenant>>;
  ws: Awaited<ReturnType<typeof createWorkspace>>;
  proj: Awaited<ReturnType<typeof createProject>>;
  token: string;
}> {
  const user = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  const proj = await createProject({
    workspaceId: ws.id,
    createdByUserId: user.user.id,
    key: 'CMT',
  });
  const { token } = await loginAs(user.user.email, user.password);
  return { user, tenant, ws, proj, token };
}

describe('POST /api/tenants/:t/workspaces/:w/projects/:projectSlug/issues', () => {
  it('401 when unauthenticated', async () => {
    const { tenant, ws, proj } = await setupAdmin();
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .send(baseBody);
    expect(res.status).toBe(401);
  });

  it('403 when caller has read role only', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'read');

    // Need a project — create one with a separate tenant admin.
    const owner = await createUser();
    await addTenantMember(owner.user.id, tenant.id, 'admin');
    const proj = await createProject({
      workspaceId: ws.id,
      createdByUserId: owner.user.id,
      key: 'RDO',
    });

    const { token } = await loginAs(user.email, password);
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`)
      .send(baseBody);
    expect(res.status).toBe(403);
  });

  it('201 happy path: returns issue with allocated key, defaults applied', async () => {
    const { user, tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`)
      .send(baseBody);
    expect(res.status).toBe(201);
    expect(res.body.data.key).toBe(`${proj.key}-1`);
    expect(res.body.data.seq).toBe(1);
    expect(res.body.data.type).toBe('T');
    expect(res.body.data.status).toBe('backlog');
    expect(res.body.data.priority).toBe('none');
    expect(res.body.data.labels).toEqual([]);
    expect(res.body.data.description).toBeNull();
    expect(res.body.data.assigneeUserId).toBeNull();
    expect(res.body.data.reporterUserId).toBe(user.user.id);
    expect(res.body.data.workspaceId).toBe(ws.id);
    expect(res.body.data.projectId).toBe(proj.id);
  });

  it('201 honours explicit status, priority, labels, assignee, description', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const assignee = await createUser();
    await addTenantMember(assignee.user.id, tenant.id, 'write');
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'B',
        title: 'Crash on boot',
        description: 'Steps to reproduce: ...',
        status: 'in-progress',
        priority: 'urgent',
        labels: ['regression', 'p1'],
        assigneeUserId: assignee.user.id,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('B');
    expect(res.body.data.status).toBe('in-progress');
    expect(res.body.data.priority).toBe('urgent');
    expect(res.body.data.labels).toEqual(['regression', 'p1']);
    expect(res.body.data.description).toBe('Steps to reproduce: ...');
    expect(res.body.data.assigneeUserId).toBe(assignee.user.id);
  });

  it('keys increment per project on sequential creates', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    for (let i = 1; i <= 3; i++) {
      const res = await api()
        .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...baseBody, title: `Issue ${i}` });
      expect(res.status).toBe(201);
      expect(res.body.data.key).toBe(`${proj.key}-${i}`);
    }
  });

  it('400 on invalid issue type', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseBody, type: 'X' });
    expect(res.status).toBe(400);
  });

  it('400 on missing title', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'T' });
    expect(res.status).toBe(400);
  });

  it('400 on unknown status', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...baseBody, status: 'archived' });
    expect(res.status).toBe(400);
  });

  it('404 when project slug does not exist in workspace', async () => {
    const { tenant, ws, token } = await setupAdmin();
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/no-such-proj/issues`)
      .set('Authorization', `Bearer ${token}`)
      .send(baseBody);
    expect(res.status).toBe(404);
  });

  it('409 when workspace is archived', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const proj = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      key: 'ARC',
    });
    // archive after project creation
    const { token } = await loginAs(user.email, password);
    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`)
      .send(baseBody);
    expect(res.status).toBe(409);
  });

  it('409 when tenant is deactivated', async () => {
    const { user, tenant, ws, proj, token } = await setupAdmin();
    void user;
    await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`)
      .send(baseBody);
    expect(res.status).toBe(409);
  });

  it('400 when creating a Story without a parent', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'S', title: 'Orphan story' });
    expect(res.status).toBe(400);
  });

  it('201 when creating a Story under an Epic parent', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const epicRes = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'E', title: 'Big initiative' });
    expect(epicRes.status).toBe(201);
    const epicKey = epicRes.body.data.key;

    const storyRes = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'S', title: 'Sub story', parent: epicKey });
    expect(storyRes.status).toBe(201);
    expect(storyRes.body.data.parent).toBe(epicKey);

    // The Epic should now list the Story as a child.
    const epicGet = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${epicKey}`)
      .set('Authorization', `Bearer ${token}`);
    expect(epicGet.status).toBe(200);
    expect(epicGet.body.data.children).toContain(storyRes.body.data.key);
  });

  it('cross-workspace isolation: cannot create an issue under a project that lives in another workspace', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const w1 = await createWorkspace({ tenantId: tenant.id });
    const w2 = await createWorkspace({ tenantId: tenant.id });
    // project lives in w2; we'll try to create an issue under w1's URL
    // using w2's slug — should 404 (w1 doesn't have a project with that slug).
    const proj = await createProject({
      workspaceId: w2.id,
      createdByUserId: user.id,
      slug: 'cross-proj',
      key: 'XPR',
    });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${w1.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`)
      .send(baseBody);
    expect(res.status).toBe(404);
  });
});
