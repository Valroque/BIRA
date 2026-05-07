import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
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
  const { token } = await loginAs(user.email, password);
  return { user, tenant, ws, proj, token };
}

describe('GET /api/tenants/:t/workspaces/:w/projects/:projectSlug/milestones/:id', () => {
  it('401 when unauthenticated', async () => {
    const { tenant, ws, proj } = await setupAdmin();
    const m = await createMilestone({ workspaceId: ws.id, projectId: proj.id });
    const res = await api().get(
      `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones/${m.id}`
    );
    expect(res.status).toBe(401);
  });

  it('200 happy path', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const m = await createMilestone({
      workspaceId: ws.id,
      projectId: proj.id,
      name: 'Beta Launch',
      description: 'Internal beta',
      date: '2026-05-01',
    });
    const res = await api()
      .get(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones/${m.id}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(m.id);
    expect(res.body.data.name).toBe('Beta Launch');
    expect(res.body.data.description).toBe('Internal beta');
    expect(res.body.data.date).toBe('2026-05-01');
  });

  it('404 when id is unknown', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .get(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones/00000000-0000-0000-0000-000000000099`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('404 when id refers to a milestone in another workspace', async () => {
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

    // Try fetching the wsB milestone via the wsA URL.
    const res = await api()
      .get(
        `/api/tenants/${tenant.slug}/workspaces/${wsA.slug}/projects/${projA.slug}/milestones/${m.id}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('404 when milestone exists in workspace but on a different project than the URL', async () => {
    const { user, tenant, ws, token } = await setupAdmin();
    const projA = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      slug: 'a',
      key: 'A',
    });
    const projB = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      slug: 'b',
      key: 'B',
    });
    const m = await createMilestone({ workspaceId: ws.id, projectId: projA.id });

    const res = await api()
      .get(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${projB.slug}/milestones/${m.id}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
