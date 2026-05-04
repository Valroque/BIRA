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

describe('GET /api/tenants/:tenantSlug/workspaces/:workspaceSlug', () => {
  it('200 happy path: response includes workspace and role', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.workspace.id).toBe(ws.id);
    expect(res.body.data.workspace.slug).toBe(ws.slug);
    expect(res.body.data.role).toBe('admin');
  });

  it('404 for unknown workspace slug', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/no-such-ws`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('403 when tenant member has no workspace role and is not tenant admin', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 write member with explicit workspace membership can GET', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('write');
  });

  it('404 when workspace is archived and includeArchived is NOT set', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id, status: 'archived' });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('200 when workspace is archived AND includeArchived=true', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id, status: 'archived' });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}?includeArchived=true`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.workspace.status).toBe('archived');
  });

  it('200 tenant admin can GET any workspace without explicit membership', async () => {
    const admin = await createUser();
    const tenant = await createTenant();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
  });
});
