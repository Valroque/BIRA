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
  name: 'Beta Launch',
  date: '2026-05-01',
};

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

describe('POST /api/tenants/:t/workspaces/:w/projects/:projectSlug/milestones', () => {
  it('401 when unauthenticated', async () => {
    const { tenant, ws, proj } = await setupAdmin();
    const res = await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones`
      )
      .send(baseBody);
    expect(res.status).toBe(401);
  });

  it('403 when caller has read role only', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'read');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'read');

    // Need a project — create one with a separate tenant admin.
    const owner = await createUser();
    await addTenantMember(owner.user.id, tenant.id, 'admin');
    const proj = await createProject({
      workspaceId: ws.id,
      createdByUserId: owner.user.id,
      key: 'RDM',
    });

    const { token } = await loginAs(user.email, password);
    const res = await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones`
      )
      .set('Authorization', `Bearer ${token}`)
      .send(baseBody);
    expect(res.status).toBe(403);
  });

  it('201 happy path with all fields', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Mutual Fund Go-Live',
        description: 'Launch the MF onboarding flow.',
        date: '2026-05-28',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Mutual Fund Go-Live');
    expect(res.body.data.description).toBe('Launch the MF onboarding flow.');
    expect(res.body.data.date).toBe('2026-05-28');
    expect(res.body.data.workspaceId).toBe(ws.id);
    expect(res.body.data.projectId).toBe(proj.id);
    expect(typeof res.body.data.id).toBe('string');
    expect(res.body.data.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('201 happy path with name + date only (description null)', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones`
      )
      .set('Authorization', `Bearer ${token}`)
      .send(baseBody);
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Beta Launch');
    expect(res.body.data.description).toBeNull();
    expect(res.body.data.date).toBe('2026-05-01');
  });

  it('400 when name is missing', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-05-01' });
    expect(res.status).toBe(400);
  });

  it('400 on invalid date format', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad date', date: '05/28/2026' });
    expect(res.status).toBe(400);
  });

  it('404 when project slug does not exist in workspace', async () => {
    const { tenant, ws, token } = await setupAdmin();
    const res = await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/no-such-proj/milestones`
      )
      .set('Authorization', `Bearer ${token}`)
      .send(baseBody);
    expect(res.status).toBe(404);
  });

  it('cross-workspace isolation: cannot create a milestone under a project that lives in another workspace', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const w1 = await createWorkspace({ tenantId: tenant.id });
    const w2 = await createWorkspace({ tenantId: tenant.id });
    const proj = await createProject({
      workspaceId: w2.id,
      createdByUserId: user.id,
      slug: 'cross-proj',
      key: 'XPM',
    });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${w1.slug}/projects/${proj.slug}/milestones`
      )
      .set('Authorization', `Bearer ${token}`)
      .send(baseBody);
    expect(res.status).toBe(404);
  });

  it('409 when project is archived', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const proj = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      key: 'ARM',
    });
    const { token } = await loginAs(user.email, password);
    // archive the project
    await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/archive`
      )
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/milestones`
      )
      .set('Authorization', `Bearer ${token}`)
      .send(baseBody);
    expect(res.status).toBe(409);
  });
});
