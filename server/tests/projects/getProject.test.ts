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

describe('GET /api/tenants/:t/workspaces/:w/projects/:projectSlug', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const res = await api().get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/any`);
    expect(res.status).toBe(401);
  });

  it('403 when user has no workspace role and is not tenant admin', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { creator } = await (async () => {
      const u = await createUser();
      await addTenantMember(u.user.id, tenant.id, 'admin');
      return { creator: u };
    })();
    const proj = await createProject({ workspaceId: ws.id, createdByUserId: creator.user.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 happy path: returns project data', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const proj = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(proj.id);
    expect(res.body.data.slug).toBe(proj.slug);
  });

  it('404 for unknown project slug', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/no-such-proj`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('404 for project that exists in a different workspace (cross-workspace isolation)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const w1 = await createWorkspace({ tenantId: tenant.id });
    const w2 = await createWorkspace({ tenantId: tenant.id });
    // project in w2 — give it a fixed slug to look up in w1
    const proj = await createProject({ workspaceId: w2.id, createdByUserId: user.id, slug: 'cross-ws-proj', key: 'CWP' });
    const { token } = await loginAs(user.email, password);

    // look it up under w1 — must 404, not leak w2 data
    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${w1.slug}/projects/${proj.slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('200 as tenant admin without explicit workspace membership', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const proj = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('200 as explicit workspace member (write)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'write');
    const proj = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
