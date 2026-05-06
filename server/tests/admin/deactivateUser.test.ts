import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { addTenantMember, createTenant, createUser, loginAs } from '../helpers/factories.js';

describe('POST /api/tenants/:tenantSlug/members/:userId/deactivate', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const target = await createUser();
    const res = await api().post(
      `/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`
    );
    expect(res.status).toBe(401);
  });

  it('403 when caller is tenant write (not admin)', async () => {
    const tenant = await createTenant();
    const writer = await createUser();
    const target = await createUser();
    await addTenantMember(writer.user.id, tenant.id, 'write');
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(writer.user.email, writer.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('400 when admin targets themselves', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${admin.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('404 when target user is not a member of this tenant', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const stranger = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${stranger.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('404 when target is a member of a different tenant only', async () => {
    const tenantA = await createTenant({ slug: 'tenant-da-a' });
    const tenantB = await createTenant({ slug: 'tenant-da-b' });
    const admin = await createUser();
    const inOther = await createUser();
    await addTenantMember(admin.user.id, tenantA.id, 'admin');
    await addTenantMember(inOther.user.id, tenantB.id, 'write');
    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenantA.slug}/members/${inOther.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('200 happy path: flips isActive to false; subsequent login fails', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const target = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    // Login refuses (returns 401 invalid credentials, not 403, to avoid
    // leaking account-state info — matches the existing login usecase).
    const loginRes = await api()
      .post('/api/auth/login')
      .send({ email: target.user.email, password: target.password });
    expect(loginRes.status).toBe(401);
  });

  it('existing access tokens are rejected after deactivation', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const target = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    await addTenantMember(target.user.id, tenant.id, 'write');
    const adminAuth = await loginAs(admin.user.email, admin.password);
    const targetAuth = await loginAs(target.user.email, target.password);

    // Token works before deactivation
    const before = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${targetAuth.token}`);
    expect(before.status).toBe(200);

    await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`)
      .set('Authorization', `Bearer ${adminAuth.token}`);

    const after = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${targetAuth.token}`);
    expect(after.status).toBe(401);
  });

  it('200 idempotent: deactivating an already-deactivated user', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const target = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(admin.user.email, admin.password);

    await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    const second = await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.data.isActive).toBe(false);
  });
});

describe('POST /api/tenants/:tenantSlug/members/:userId/reactivate', () => {
  it('200 happy path: deactivate then reactivate restores login', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const target = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(admin.user.email, admin.password);

    await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/reactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);

    const loginRes = await api()
      .post('/api/auth/login')
      .send({ email: target.user.email, password: target.password });
    expect(loginRes.status).toBe(200);
  });

  it('200 idempotent: reactivating an already-active user', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const target = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/reactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
  });

  it('400 when admin reactivates themselves', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${admin.user.id}/reactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
