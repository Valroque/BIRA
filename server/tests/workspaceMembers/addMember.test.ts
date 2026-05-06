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

describe('POST /api/tenants/:t/workspaces/:w/members', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const target = await createUser();
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members`)
      .send({ userId: target.user.id, role: 'write' });
    expect(res.status).toBe(401);
  });

  it('403 when caller is workspace write (not admin)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'write');
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.user.id, role: 'write' });
    expect(res.status).toBe(403);
  });

  it('400 when target is not a tenant member', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const stranger = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: stranger.user.id, role: 'write' });
    expect(res.status).toBe(400);
  });

  it('409 when target is already a workspace member', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    await addWorkspaceMember(target.user.id, ws.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.user.id, role: 'write' });
    expect(res.status).toBe(409);
  });

  it('201 happy path: returns hydrated member view', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const target = await createUser({ firstName: 'Tara' });
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.user.id, role: 'write' });
    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(target.user.id);
    expect(res.body.data.role).toBe('write');
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.user.firstName).toBe('Tara');
  });

  it('409 when workspace is archived', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id, status: 'archived' });
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.user.id, role: 'write' });
    expect(res.status).toBe(409);
  });
});
