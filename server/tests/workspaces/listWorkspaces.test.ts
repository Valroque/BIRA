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

describe('GET /api/tenants/:tenantSlug/workspaces', () => {
  it('401 when no Authorization header', async () => {
    const tenant = await createTenant();
    const res = await api().get(`/api/tenants/${tenant.slug}/workspaces`);
    expect(res.status).toBe(401);
  });

  it('403 when authenticated user is not a tenant member', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 tenant admin sees all workspaces (tenant-admin-wins)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws1 = await createWorkspace({ tenantId: tenant.id });
    const ws2 = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((item: { workspace: { slug: string } }) => item.workspace.slug);
    expect(slugs).toContain(ws1.slug);
    expect(slugs).toContain(ws2.slug);
  });

  it('200 write member with no workspace rows sees zero workspaces', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('200 write member with explicit workspace membership sees that workspace', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].workspace.slug).toBe(ws.slug);
    expect(res.body.data[0].role).toBe('write');
  });

  it('200 hides archived workspaces by default; shows them with includeArchived=true', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const active = await createWorkspace({ tenantId: tenant.id });
    const archived = await createWorkspace({ tenantId: tenant.id, status: 'archived' });
    const { token } = await loginAs(user.email, password);

    const defaultRes = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`);
    expect(defaultRes.status).toBe(200);
    const defaultSlugs = defaultRes.body.data.map((i: { workspace: { slug: string } }) => i.workspace.slug);
    expect(defaultSlugs).toContain(active.slug);
    expect(defaultSlugs).not.toContain(archived.slug);

    const allRes = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces?includeArchived=true`)
      .set('Authorization', `Bearer ${token}`);
    expect(allRes.status).toBe(200);
    const allSlugs = allRes.body.data.map((i: { workspace: { slug: string } }) => i.workspace.slug);
    expect(allSlugs).toContain(archived.slug);
  });

  it('200 cross-tenant isolation: admin in T1 cannot see T2 workspaces', async () => {
    const { user, password } = await createUser();
    const t1 = await createTenant();
    const t2 = await createTenant();
    await addTenantMember(user.id, t1.id, 'admin');
    const ws1 = await createWorkspace({ tenantId: t1.id });
    await createWorkspace({ tenantId: t2.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${t1.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((i: { workspace: { slug: string } }) => i.workspace.slug);
    expect(slugs).toContain(ws1.slug);
    expect(slugs).toHaveLength(1);
  });
});
