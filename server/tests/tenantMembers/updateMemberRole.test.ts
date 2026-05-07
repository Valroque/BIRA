import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  loginAs,
} from '../helpers/factories.js';

describe('PATCH /api/tenants/:t/members/:userId', () => {
  it('403 when caller is tenant write (not admin)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/members/${target.user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('200 happy path: promotes write to admin', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/members/${target.user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
  });

  it('200 idempotent: patching to current role is a no-op', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/members/${target.user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'write' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('write');
  });

  it('409 last-admin guard: cannot demote the only active admin', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const writer = await createUser();
    await addTenantMember(writer.user.id, tenant.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/members/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'write' });
    expect(res.status).toBe(409);
  });

  it('200 demotion allowed when another active admin remains', async () => {
    const tenant = await createTenant();
    const a = await createUser();
    const b = await createUser();
    await addTenantMember(a.user.id, tenant.id, 'admin');
    await addTenantMember(b.user.id, tenant.id, 'admin');
    const { token } = await loginAs(b.user.email, b.password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/members/${a.user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'write' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('write');
  });

  it('404 when target user has no membership in this tenant', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const stranger = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/members/${stranger.user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'write' });
    expect(res.status).toBe(404);
  });
});
