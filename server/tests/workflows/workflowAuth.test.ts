import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  addWorkspaceMember,
  loginAs,
} from '../helpers/factories.js';

/**
 * RBAC test-coverage gap (#21 slice 4): the existing workflowCrud /
 * workflowGuard suites cover happy paths + a few denial cases, but
 * they don't sweep 401-unauth or the archived-workspace gate
 * across every CRUD route, and they don't probe cross-workspace slug
 * isolation. This file fills those gaps.
 *
 * Routes under test:
 *   GET    /workflows                  workspace member
 *   POST   /workflows                  workspace 'write'
 *   GET    /workflows/:slug            workspace member
 *   PATCH  /workflows/:slug            workspace 'write'
 *   DELETE /workflows/:slug            workspace 'admin'
 */

async function setupAdmin() {
  const { user, password } = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  const { token } = await loginAs(user.email, password);
  return { user, tenant, ws, token };
}

function workflowsUrl(tenantSlug: string, workspaceSlug: string): string {
  return `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/workflows`;
}

async function seedWorkflow(tenantSlug: string, workspaceSlug: string, token: string, slug: string) {
  const res = await api()
    .post(workflowsUrl(tenantSlug, workspaceSlug))
    .set('Authorization', `Bearer ${token}`)
    .send({
      slug,
      name: slug,
      nodes: [{ statusId: 'backlog', x: 0, y: 0, isInitial: true }],
    });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe('workflows — 401 unauthenticated', () => {
  it('GET / 401', async () => {
    const { tenant, ws } = await setupAdmin();
    const res = await api().get(workflowsUrl(tenant.slug, ws.slug));
    expect(res.status).toBe(401);
  });

  it('POST / 401', async () => {
    const { tenant, ws } = await setupAdmin();
    const res = await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .send({
        slug: 'wf',
        name: 'WF',
        nodes: [{ statusId: 'backlog', x: 0, y: 0, isInitial: true }],
      });
    expect(res.status).toBe(401);
  });

  it('GET /:slug 401', async () => {
    const { tenant, ws, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'one');
    const res = await api().get(`${workflowsUrl(tenant.slug, ws.slug)}/one`);
    expect(res.status).toBe(401);
  });

  it('PATCH /:slug 401', async () => {
    const { tenant, ws, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'one');
    const res = await api()
      .patch(`${workflowsUrl(tenant.slug, ws.slug)}/one`)
      .send({ name: 'New' });
    expect(res.status).toBe(401);
  });

  it('DELETE /:slug 401', async () => {
    const { tenant, ws, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'one');
    const res = await api().delete(`${workflowsUrl(tenant.slug, ws.slug)}/one`);
    expect(res.status).toBe(401);
  });
});

describe('workflows — 403 wrong role', () => {
  it('GET / allows workspace read', async () => {
    // GET is workspace-member-level — verify a 'read' caller is NOT
    // 403'd here (this is the lower bound of the role ladder).
    const { tenant, ws } = await setupAdmin();
    const reader = await createUser();
    await addTenantMember(reader.user.id, tenant.id, 'read');
    await addWorkspaceMember(reader.user.id, ws.id, 'read');
    const { token } = await loginAs(reader.user.email, reader.password);
    const res = await api()
      .get(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('PATCH /:slug 403 for read caller', async () => {
    const { tenant, ws, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'one');
    const reader = await createUser();
    await addTenantMember(reader.user.id, tenant.id, 'read');
    await addWorkspaceMember(reader.user.id, ws.id, 'read');
    const { token: readerToken } = await loginAs(reader.user.email, reader.password);
    const res = await api()
      .patch(`${workflowsUrl(tenant.slug, ws.slug)}/one`)
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(403);
  });

  it('DELETE /:slug 403 for write caller (admin only)', async () => {
    const { tenant, ws, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'one');
    const writer = await createUser();
    await addTenantMember(writer.user.id, tenant.id, 'write');
    await addWorkspaceMember(writer.user.id, ws.id, 'write');
    const { token: writerToken } = await loginAs(writer.user.email, writer.password);
    const res = await api()
      .delete(`${workflowsUrl(tenant.slug, ws.slug)}/one`)
      .set('Authorization', `Bearer ${writerToken}`);
    expect(res.status).toBe(403);
  });
});

describe('workflows — archived workspace gate (409)', () => {
  it('POST / 409 when workspace archived', async () => {
    const { tenant, ws, token } = await setupAdmin();
    const archive = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    expect(archive.status).toBe(200);
    const res = await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'too-late',
        name: 'Too late',
        nodes: [{ statusId: 'backlog', x: 0, y: 0, isInitial: true }],
      });
    expect(res.status).toBe(409);
  });

  it('PATCH /:slug 409 when workspace archived', async () => {
    const { tenant, ws, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'one');
    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    const res = await api()
      .patch(`${workflowsUrl(tenant.slug, ws.slug)}/one`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Frozen' });
    expect(res.status).toBe(409);
  });

  it('DELETE /:slug 409 when workspace archived', async () => {
    const { tenant, ws, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'one');
    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    const res = await api()
      .delete(`${workflowsUrl(tenant.slug, ws.slug)}/one`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it('GET /:slug still works on archived workspace (reads bypass the gate)', async () => {
    const { tenant, ws, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'one');
    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    // requireActiveWorkspace is only mounted on mutation routes, so a
    // GET against an archived workspace passes through.
    const res = await api()
      .get(`${workflowsUrl(tenant.slug, ws.slug)}/one`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('one');
  });
});

describe('workflows — cross-workspace isolation', () => {
  it('GET /:slug 404 when slug lives in another workspace', async () => {
    const { tenant, ws, token, user } = await setupAdmin();
    void user;
    const otherWs = await createWorkspace({ tenantId: tenant.id });
    // Seed a workflow under otherWs, then try to fetch it via ws's URL.
    await seedWorkflow(tenant.slug, otherWs.slug, token, 'cross');
    const res = await api()
      .get(`${workflowsUrl(tenant.slug, ws.slug)}/cross`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('PATCH /:slug 404 when slug lives in another workspace', async () => {
    const { tenant, ws, token } = await setupAdmin();
    const otherWs = await createWorkspace({ tenantId: tenant.id });
    await seedWorkflow(tenant.slug, otherWs.slug, token, 'cross');
    const res = await api()
      .patch(`${workflowsUrl(tenant.slug, ws.slug)}/cross`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hijack' });
    expect(res.status).toBe(404);
  });

  it('DELETE /:slug 404 when slug lives in another workspace', async () => {
    const { tenant, ws, token } = await setupAdmin();
    const otherWs = await createWorkspace({ tenantId: tenant.id });
    await seedWorkflow(tenant.slug, otherWs.slug, token, 'cross');
    const res = await api()
      .delete(`${workflowsUrl(tenant.slug, ws.slug)}/cross`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
