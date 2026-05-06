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

describe('GET /api/tenants/:t/workspaces/:w/members', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const res = await api().get(
      `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members`
    );
    expect(res.status).toBe(401);
  });

  it('403 when user has no workspace role', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 returns hydrated member list with tenantAdmin flag', async () => {
    const { user: admin, password } = await createUser({ firstName: 'Adam' });
    const writer = await createUser({ firstName: 'Wendy' });
    const tenant = await createTenant();
    await addTenantMember(admin.id, tenant.id, 'admin');
    await addTenantMember(writer.user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(admin.id, ws.id, 'admin');
    await addWorkspaceMember(writer.user.id, ws.id, 'write');
    const { token } = await loginAs(admin.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);

    const adminRow = res.body.data.find(
      (m: { userId: string }) => m.userId === admin.id
    );
    const writerRow = res.body.data.find(
      (m: { userId: string }) => m.userId === writer.user.id
    );
    expect(adminRow.role).toBe('admin');
    expect(adminRow.tenantAdmin).toBe(true);
    expect(adminRow.user.displayName).toContain('Adam');
    expect(writerRow.role).toBe('write');
    expect(writerRow.tenantAdmin).toBe(false);
  });

  it('200 visible to non-admin workspace members (read access)', async () => {
    const { user: admin } = await createUser();
    const reader = await createUser();
    const tenant = await createTenant();
    await addTenantMember(admin.id, tenant.id, 'admin');
    await addTenantMember(reader.user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(admin.id, ws.id, 'admin');
    await addWorkspaceMember(reader.user.id, ws.id, 'read');
    const { token } = await loginAs(reader.user.email, reader.password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
