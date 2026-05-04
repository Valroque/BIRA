import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { addTenantMember, createTenant, createUser, loginAs } from '../helpers/factories.js';

const TEMP_PWD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

describe('POST /api/tenants/:tenantSlug/members/:userId/reset-password', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const target = await createUser();

    const res = await api().post(
      `/api/tenants/${tenant.slug}/members/${target.user.id}/reset-password`
    );
    expect(res.status).toBe(401);
  });

  it('403 when caller is not a tenant admin (write role)', async () => {
    const tenant = await createTenant();
    const writer = await createUser();
    const target = await createUser();
    await addTenantMember(writer.user.id, tenant.id, 'write');
    await addTenantMember(target.user.id, tenant.id, 'write');

    const { token } = await loginAs(writer.user.email, writer.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('400 when admin targets themselves', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');

    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${admin.user.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('404 when target user is not a member of this tenant', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const stranger = await createUser(); // No membership anywhere
    await addTenantMember(admin.user.id, tenant.id, 'admin');

    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${stranger.user.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('404 when target user is a member of a different tenant only', async () => {
    const tenantA = await createTenant({ slug: 'tenant-a' });
    const tenantB = await createTenant({ slug: 'tenant-b' });
    const admin = await createUser();
    const inOther = await createUser();
    await addTenantMember(admin.user.id, tenantA.id, 'admin');
    await addTenantMember(inOther.user.id, tenantB.id, 'write');

    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenantA.slug}/members/${inOther.user.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('200 happy path: returns 16-char temp pwd, flips mustReset, gates next call to 423', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const target = await createUser({ password: 'oldpass1234' });
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    await addTenantMember(target.user.id, tenant.id, 'write');

    const { token: adminToken } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const temp = res.body.data.temporaryPassword;
    expect(typeof temp).toBe('string');
    expect(temp).toHaveLength(16);
    // Every char must be from the unambiguous alphabet (no 0/O/l/I/1).
    for (const c of temp) {
      expect(TEMP_PWD_ALPHABET).toContain(c);
    }
    expect(res.body.data.user.id).toBe(target.user.id);
    expect(res.body.data.user.mustResetPassword).toBe(true);

    // Login with the temp password succeeds (login is the one path that
    // is NOT blocked by the gate — the user has to be able to authenticate
    // before they can hit change-password).
    const tempLogin = await api()
      .post('/api/auth/login')
      .send({ email: target.user.email, password: temp });
    expect(tempLogin.status).toBe(200);
    const lockedToken = tempLogin.body.data.token;

    // Subsequent /api/tenants/... → 423.
    const tenantsRes = await api()
      .get('/api/tenants')
      .set('Authorization', `Bearer ${lockedToken}`);
    expect(tenantsRes.status).toBe(423);
    expect(tenantsRes.body.code).toBe('PASSWORD_RESET_REQUIRED');
  });
});
