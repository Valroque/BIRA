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

describe('GET /api/tenants/:t/workspaces/:w/projects', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const res = await api().get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`);
    expect(res.status).toBe(401);
  });

  it('403 when user has no workspace role', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 returns projects in the workspace', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const p1 = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const p2 = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain(p1.slug);
    expect(slugs).toContain(p2.slug);
  });

  it('200 empty list when workspace has no projects', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('200 cross-workspace isolation: projects from W2 do not appear in W1 list', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const w1 = await createWorkspace({ tenantId: tenant.id });
    const w2 = await createWorkspace({ tenantId: tenant.id });
    const p1 = await createProject({ workspaceId: w1.id, createdByUserId: user.id });
    const p2 = await createProject({ workspaceId: w2.id, createdByUserId: user.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${w1.slug}/projects`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain(p1.slug);
    expect(slugs).not.toContain(p2.slug);
  });

  it('200 tenant admin sees projects without explicit workspace membership', async () => {
    const admin = await createUser();
    const tenant = await createTenant();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const proj = await createProject({ workspaceId: ws.id, createdByUserId: admin.user.id });
    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { slug: string }) => p.slug)).toContain(proj.slug);
  });
});
