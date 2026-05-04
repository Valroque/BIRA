import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  loginAs,
} from '../helpers/factories.js';

describe('POST /api/tenants/:tenantSlug/workspaces/:workspaceSlug/unarchive', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id, status: 'archived' });
    const res = await api().post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/unarchive`);
    expect(res.status).toBe(401);
  });

  it('403 when caller is tenant write (not tenant admin)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id, status: 'archived' });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/unarchive`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 happy path: archive then unarchive flips status back to active', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id, status: 'archived' });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/unarchive`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  it('200 idempotent: unarchiving an already-active workspace', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/unarchive`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });
});
