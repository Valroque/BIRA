import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  createProject,
  createIssue,
  loginAs,
} from '../helpers/factories.js';

describe('GET /api/tenants/:t/workspaces/:w/projects/:projectSlug/issues/:key', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const res = await api().get(
      `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/any/issues/ANY-1`
    );
    expect(res.status).toBe(401);
  });

  it('200 returns the issue', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const proj = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      key: 'GET',
    });
    const issue = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      title: 'Findable issue',
    });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${issue.key}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.key).toBe(issue.key);
    expect(res.body.data.title).toBe('Findable issue');
  });

  it('404 when key does not exist', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const proj = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      key: 'ZZZ',
    });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/ZZZ-9999`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('cross-workspace isolation: an issue in WS A is not visible from WS B URL', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const a = await createWorkspace({ tenantId: tenant.id });
    const b = await createWorkspace({ tenantId: tenant.id });
    const projA = await createProject({
      workspaceId: a.id,
      createdByUserId: user.id,
      slug: 'proj-a',
      key: 'AAA',
    });
    const projB = await createProject({
      workspaceId: b.id,
      createdByUserId: user.id,
      slug: 'proj-b',
      key: 'BBB',
    });
    const issueA = await createIssue({
      workspaceId: a.id,
      projectId: projA.id,
      reporterUserId: user.id,
    });
    const { token } = await loginAs(user.email, password);

    // visit B with A's key — should 404 (workspace scope means findByKey
    // returns nothing).
    const res = await api()
      .get(
        `/api/tenants/${tenant.slug}/workspaces/${b.slug}/projects/${projB.slug}/issues/${issueA.key}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
