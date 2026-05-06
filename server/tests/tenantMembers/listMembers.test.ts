import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  loginAs,
} from '../helpers/factories.js';

describe('GET /api/tenants/:t/members', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const res = await api().get(`/api/tenants/${tenant.slug}/members`);
    expect(res.status).toBe(401);
  });

  it('403 when caller is not a tenant member', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    // No tenant_membership row for `user` on `tenant` → resolveTenantScope
    // rejects.
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/members`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 returns hydrated tenant member list', async () => {
    const { user: admin, password } = await createUser({ firstName: 'Adam' });
    const writer = await createUser({ firstName: 'Wendy' });
    const reader = await createUser({ firstName: 'Riley' });
    const tenant = await createTenant();
    await addTenantMember(admin.id, tenant.id, 'admin');
    await addTenantMember(writer.user.id, tenant.id, 'write');
    await addTenantMember(reader.user.id, tenant.id, 'read');
    const { token } = await loginAs(admin.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/members`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);

    const adminRow = res.body.data.find(
      (m: { userId: string }) => m.userId === admin.id
    );
    const writerRow = res.body.data.find(
      (m: { userId: string }) => m.userId === writer.user.id
    );
    const readerRow = res.body.data.find(
      (m: { userId: string }) => m.userId === reader.user.id
    );
    expect(adminRow.role).toBe('admin');
    expect(adminRow.user.displayName).toContain('Adam');
    expect(adminRow.tenantId).toBe(tenant.id);
    expect(writerRow.role).toBe('write');
    expect(readerRow.role).toBe('read');
  });

  it('200 visible to non-admin tenant members (read+)', async () => {
    const { user: admin } = await createUser();
    const reader = await createUser();
    const tenant = await createTenant();
    await addTenantMember(admin.id, tenant.id, 'admin');
    await addTenantMember(reader.user.id, tenant.id, 'read');
    const { token } = await loginAs(reader.user.email, reader.password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/members`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('200 only returns members of the requested tenant (no cross-tenant leak)', async () => {
    const { user: admin, password } = await createUser({ firstName: 'Adam' });
    const otherUser = await createUser({ firstName: 'Other' });
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    await addTenantMember(admin.id, tenantA.id, 'admin');
    await addTenantMember(admin.id, tenantB.id, 'admin');
    await addTenantMember(otherUser.user.id, tenantB.id, 'write');
    const { token } = await loginAs(admin.email, password);

    const res = await api()
      .get(`/api/tenants/${tenantA.slug}/members`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const userIds = res.body.data.map((m: { userId: string }) => m.userId);
    expect(userIds).toContain(admin.id);
    expect(userIds).not.toContain(otherUser.user.id);
  });
});
