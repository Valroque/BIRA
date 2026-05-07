import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  loginAs,
} from '../helpers/factories.js';
import { db } from '../../src/db/knex.js';

describe('POST /api/tenants/:t/members', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const target = await createUser();
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members`)
      .send({ userId: target.user.id, role: 'write' });
    expect(res.status).toBe(401);
  });

  it('403 when caller is tenant write (not admin)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const target = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.user.id, role: 'write' });
    expect(res.status).toBe(403);
  });

  it('404 when target user does not exist', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: '00000000-0000-0000-0000-000000000000',
        role: 'write',
      });
    expect(res.status).toBe(404);
  });

  it('201 happy path: pulls a freshly-registered user into the tenant', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const target = await createUser({ firstName: 'Tara' });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.user.id, role: 'write' });
    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(target.user.id);
    expect(res.body.data.role).toBe('write');
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.user.firstName).toBe('Tara');
    expect(res.body.data.tenantId).toBe(tenant.id);
  });

  it('201 idempotent on already-active member: returns existing without role change', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members`)
      .set('Authorization', `Bearer ${token}`)
      // Caller passed `read` but the existing row stays at `write` —
      // role changes go through PATCH, double-add is a no-op.
      .send({ userId: target.user.id, role: 'read' });
    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(target.user.id);
    expect(res.body.data.role).toBe('write');
    expect(res.body.data.status).toBe('active');

    const rowCount = (await db('tenant_memberships')
      .where({ userId: target.user.id, tenantId: tenant.id })
      .count<{ count: string }[]>('id as count'))[0].count;
    expect(Number(rowCount)).toBe(1);
  });

  it('201 reactivates a deactivated row in place with the new role', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    // Flip status to deactivated directly — the `register` flow leaves
    // users without memberships, so this stand-in models a previously-
    // removed member who's now being re-added.
    await db('tenant_memberships')
      .where({ userId: target.user.id, tenantId: tenant.id })
      .update({ status: 'deactivated' });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.user.id, role: 'read' });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('read');
    expect(res.body.data.status).toBe('active');
  });

  it('409 when tenant is deactivated', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    await db('tenants').where('id', tenant.id).update({ status: 'deactivated' });
    const target = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.user.id, role: 'write' });
    expect(res.status).toBe(409);
  });
});
