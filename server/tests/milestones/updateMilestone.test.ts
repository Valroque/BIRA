import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  addWorkspaceMember,
  createProject,
  createMilestone,
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
    key: 'MIL',
  });
  const milestone = await createMilestone({
    workspaceId: ws.id,
    projectId: proj.id,
    name: 'Original',
    description: 'Original desc',
    date: '2026-05-01',
  });
  const { token } = await loginAs(user.email, password);
  return { user, tenant, ws, proj, milestone, token };
}

describe('PATCH /api/tenants/:t/workspaces/:w/projects/:projectSlug/milestones/:id', () => {
  it('401 when unauthenticated', async () => {
    const { tenant, ws, proj, milestone } = await setupAdmin();
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones/${milestone.id}`
      )
      .send({ name: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('403 when caller has read role only', async () => {
    const { tenant, ws, proj, milestone } = await setupAdmin();
    const reader = await createUser();
    await addTenantMember(reader.user.id, tenant.id, 'read');
    await addWorkspaceMember(reader.user.id, ws.id, 'read');
    const { token } = await loginAs(reader.user.email, reader.password);
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones/${milestone.id}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('200 partial patch (name only)', async () => {
    const { tenant, ws, proj, milestone, token } = await setupAdmin();
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones/${milestone.id}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed');
    // Other fields untouched.
    expect(res.body.data.description).toBe('Original desc');
    expect(res.body.data.date).toBe('2026-05-01');
  });

  it('200 patch description to null', async () => {
    const { tenant, ws, proj, milestone, token } = await setupAdmin();
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones/${milestone.id}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ description: null });
    expect(res.status).toBe(200);
    expect(res.body.data.description).toBeNull();
  });

  it('400 when patch is empty', async () => {
    const { tenant, ws, proj, milestone, token } = await setupAdmin();
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones/${milestone.id}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('400 on invalid date format', async () => {
    const { tenant, ws, proj, milestone, token } = await setupAdmin();
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones/${milestone.id}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ date: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  it('409 when project is archived', async () => {
    const { tenant, ws, proj, milestone, token } = await setupAdmin();
    await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/archive`
      )
      .set('Authorization', `Bearer ${token}`);
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones/${milestone.id}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(409);
  });

  it('404 when milestone exists in another workspace', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const wsA = await createWorkspace({ tenantId: tenant.id });
    const wsB = await createWorkspace({ tenantId: tenant.id });
    const projA = await createProject({
      workspaceId: wsA.id,
      createdByUserId: user.id,
      slug: 'a',
      key: 'A',
    });
    const projB = await createProject({
      workspaceId: wsB.id,
      createdByUserId: user.id,
      slug: 'b',
      key: 'B',
    });
    const m = await createMilestone({ workspaceId: wsB.id, projectId: projB.id });
    const { token } = await loginAs(user.email, password);
    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${wsA.slug}/projects/${projA.slug}/milestones/${m.id}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cross-ws' });
    expect(res.status).toBe(404);
  });
});
