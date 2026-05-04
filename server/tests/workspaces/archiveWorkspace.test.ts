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

describe('POST /api/tenants/:tenantSlug/workspaces/:workspaceSlug/archive', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const res = await api().post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`);
    expect(res.status).toBe(401);
  });

  it('403 when caller is tenant write (not tenant admin)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'admin');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    // workspace admin but NOT tenant admin → 403 (route checks tenantRole specifically)
    expect(res.status).toBe(403);
  });

  it('200 happy path as tenant admin: status flips to archived', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('archived');
  });

  it('404 on GET workspace after archive (stale bookmark fails fast)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);

    const getRes = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  });

  it('200 idempotent: archiving an already-archived workspace', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id, status: 'archived' });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('archived');
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
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});
