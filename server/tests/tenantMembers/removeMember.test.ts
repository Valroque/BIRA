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
import { db } from '../../src/db/knex.js';

describe('DELETE /api/tenants/:t/members/:userId', () => {
  it('204 admin removes another tenant member', async () => {
    const { user: admin, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(admin.id, tenant.id, 'admin');
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(admin.email, password);

    const res = await api()
      .delete(`/api/tenants/${tenant.slug}/members/${target.user.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    const after = await db('tenant_memberships')
      .where({ userId: target.user.id, tenantId: tenant.id })
      .first();
    expect(after).toBeUndefined();
  });

  it('204 self-leave: a write member can delete their own membership', async () => {
    const { user: admin } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(admin.id, tenant.id, 'admin');

    const me = await createUser();
    await addTenantMember(me.user.id, tenant.id, 'write');
    const { token } = await loginAs(me.user.email, me.password);

    const res = await api()
      .delete(`/api/tenants/${tenant.slug}/members/${me.user.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('403 when a non-admin tries to remove someone else', async () => {
    const tenant = await createTenant();
    // We still need at least one tenant admin to keep the
    // resolveTenantScope path independent, but the caller below has
    // role 'write' — the guard rejects them on (caller, target) split.
    const { user: admin } = await createUser();
    await addTenantMember(admin.id, tenant.id, 'admin');
    const writer = await createUser();
    const target = await createUser();
    await addTenantMember(writer.user.id, tenant.id, 'write');
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(writer.user.email, writer.password);

    const res = await api()
      .delete(`/api/tenants/${tenant.slug}/members/${target.user.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('409 last-admin guard: removing the only admin is refused', async () => {
    const { user: admin, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(admin.id, tenant.id, 'admin');
    const { token } = await loginAs(admin.email, password);

    const res = await api()
      .delete(`/api/tenants/${tenant.slug}/members/${admin.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it('204 last-admin guard satisfied: removal allowed when another admin remains', async () => {
    const tenant = await createTenant();
    const a = await createUser();
    const b = await createUser();
    await addTenantMember(a.user.id, tenant.id, 'admin');
    await addTenantMember(b.user.id, tenant.id, 'admin');
    const { token } = await loginAs(a.user.email, a.password);

    const res = await api()
      .delete(`/api/tenants/${tenant.slug}/members/${a.user.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('404 when target has no membership in this tenant', async () => {
    const { user: admin, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(admin.id, tenant.id, 'admin');
    const stranger = await createUser();
    const { token } = await loginAs(admin.email, password);

    const res = await api()
      .delete(`/api/tenants/${tenant.slug}/members/${stranger.user.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('204 cascades: removes workspace memberships within the tenant', async () => {
    const { user: admin, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(admin.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    await addWorkspaceMember(target.user.id, ws.id, 'write');
    const { token } = await loginAs(admin.email, password);

    const res = await api()
      .delete(`/api/tenants/${tenant.slug}/members/${target.user.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    const wsRow = await db('workspace_memberships')
      .where({ userId: target.user.id, workspaceId: ws.id })
      .first();
    expect(wsRow).toBeUndefined();
  });
});
