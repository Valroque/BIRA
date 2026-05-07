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

describe('GET /api/tenants/:t/workspaces/:w/projects/:projectSlug/milestones', () => {
  it('401 when unauthenticated', async () => {
    const { tenant, ws, proj } = await setupAdmin();
    const res = await api().get(
      `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones`
    );
    expect(res.status).toBe(401);
  });

  it('200 returns project milestones in date asc', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    await createMilestone({ workspaceId: ws.id, projectId: proj.id, name: 'Late', date: '2026-08-15' });
    await createMilestone({ workspaceId: ws.id, projectId: proj.id, name: 'Early', date: '2026-04-01' });
    await createMilestone({ workspaceId: ws.id, projectId: proj.id, name: 'Middle', date: '2026-06-01' });

    const res = await api()
      .get(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.map((m: { name: string }) => m.name)).toEqual([
      'Early',
      'Middle',
      'Late',
    ]);
  });
});

describe('GET /api/tenants/:t/workspaces/:w/milestones (workspace-scoped)', () => {
  it('returns milestones across all projects in the workspace', async () => {
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
    await createMilestone({ workspaceId: ws.id, projectId: projA.id, name: 'A1', date: '2026-04-01' });
    await createMilestone({ workspaceId: ws.id, projectId: projB.id, name: 'B1', date: '2026-05-01' });

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/milestones`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    // date asc
    expect(res.body.data[0].name).toBe('A1');
    expect(res.body.data[1].name).toBe('B1');
  });

  it('filter: ?projectId narrows to one project', async () => {
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
    await createMilestone({ workspaceId: ws.id, projectId: projA.id, name: 'A1', date: '2026-04-01' });
    await createMilestone({ workspaceId: ws.id, projectId: projB.id, name: 'B1', date: '2026-05-01' });

    const res = await api()
      .get(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/milestones?projectId=${projA.id}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('A1');
  });

  it('cross-workspace isolation: workspace A list does not include workspace B milestones', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const wsA = await createWorkspace({ tenantId: tenant.id });
    const wsB = await createWorkspace({ tenantId: tenant.id });
    const projA = await createProject({
      workspaceId: wsA.id,
      createdByUserId: user.id,
      key: 'WA',
    });
    const projB = await createProject({
      workspaceId: wsB.id,
      createdByUserId: user.id,
      key: 'WB',
    });
    await createMilestone({ workspaceId: wsA.id, projectId: projA.id, name: 'A only', date: '2026-04-01' });
    await createMilestone({ workspaceId: wsB.id, projectId: projB.id, name: 'B only', date: '2026-05-01' });

    const { token } = await loginAs(user.email, password);
    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${wsA.slug}/milestones`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('A only');
  });
});
