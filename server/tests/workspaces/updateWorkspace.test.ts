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

describe('PATCH /api/tenants/:tenantSlug/workspaces/:workspaceSlug', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(401);
  });

  it('403 when caller is tenant write with no workspace role', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(403);
  });

  it('200 as workspace admin (explicit membership)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'admin');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Name');
  });

  it('200 as tenant admin (tenant-admin-wins, no explicit workspace membership)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Admin Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Admin Updated');
  });

  it('400 when patch body is empty', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('200 even when workspace is archived (PATCH has no requireActiveWorkspace)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id, status: 'archived' });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Archived But Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Archived But Renamed');
  });

  it('409 when tenant is deactivated', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Should Fail' });
    expect(res.status).toBe(409);
  });
});
