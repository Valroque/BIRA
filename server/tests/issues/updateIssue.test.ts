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

async function setupAdmin() {
  const { user, password } = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  const proj = await createProject({
    workspaceId: ws.id,
    createdByUserId: user.id,
    key: 'UPD',
  });
  const issue = await createIssue({
    workspaceId: ws.id,
    projectId: proj.id,
    reporterUserId: user.id,
    title: 'Original title',
  });
  const { token } = await loginAs(user.email, password);
  return { user, tenant, ws, proj, issue, token };
}

describe('PATCH /api/tenants/:t/workspaces/:w/projects/:projectSlug/issues/:key', () => {
  it('401 when unauthenticated', async () => {
    const { tenant, ws, proj, issue } = await setupAdmin();
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${issue.key}`
      )
      .send({ title: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('403 when caller has read role only', async () => {
    const { tenant, ws, proj, issue } = await setupAdmin();
    const reader = await createUser();
    await addTenantMember(reader.user.id, tenant.id, 'read');
    await addWorkspaceMember(reader.user.id, ws.id, 'read');
    const { token } = await loginAs(reader.user.email, reader.password);
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${issue.key}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('200 patches title', async () => {
    const { tenant, ws, proj, issue, token } = await setupAdmin();
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${issue.key}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New title' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New title');
  });

  it('200 patches priority and labels', async () => {
    const { tenant, ws, proj, issue, token } = await setupAdmin();
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${issue.key}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ priority: 'high', labels: ['x', 'y'] });
    expect(res.status).toBe(200);
    expect(res.body.data.priority).toBe('high');
    expect(res.body.data.labels).toEqual(['x', 'y']);
  });

  it('200 status moves freely through every valid value (no workflow guard yet)', async () => {
    const { tenant, ws, proj, issue, token } = await setupAdmin();
    // Walk through the enum from backlog → done → canceled → backlog. If a
    // future workflow guard breaks this it MUST come from a slice 5 update,
    // not a regression here.
    const path = ['todo', 'in-progress', 'in-review', 'done', 'canceled', 'backlog'] as const;
    for (const status of path) {
      const res = await api()
        .patch(
          `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${issue.key}`
        )
        .set('Authorization', `Bearer ${token}`)
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(status);
    }
  });

  it('200 reassigns assignee, including null to unassign', async () => {
    const { user, tenant, ws, proj, issue, token } = await setupAdmin();
    const res1 = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${issue.key}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ assigneeUserId: user.id });
    expect(res1.status).toBe(200);
    expect(res1.body.data.assigneeUserId).toBe(user.id);

    const res2 = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${issue.key}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ assigneeUserId: null });
    expect(res2.status).toBe(200);
    expect(res2.body.data.assigneeUserId).toBeNull();
  });

  it('400 when patch is empty', async () => {
    const { tenant, ws, proj, issue, token } = await setupAdmin();
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${issue.key}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('400 on unknown status', async () => {
    const { tenant, ws, proj, issue, token } = await setupAdmin();
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${issue.key}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'archived' });
    expect(res.status).toBe(400);
  });

  it('404 on unknown key', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/UPD-9999`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'no such' });
    expect(res.status).toBe(404);
  });

  it('409 when workspace is archived', async () => {
    const { tenant, ws, proj, issue, token } = await setupAdmin();
    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${issue.key}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(409);
  });
});
