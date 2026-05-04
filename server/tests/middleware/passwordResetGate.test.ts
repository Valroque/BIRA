import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { addTenantMember, createTenant, createUser, loginAs } from '../helpers/factories.js';

describe('requirePasswordResetCleared (mounted on /api/tenants)', () => {
  async function setupLockedUser() {
    const tenant = await createTenant();
    const { user, password } = await createUser({
      password: 'temppass1234',
      mustReset: true,
    });
    await addTenantMember(user.id, tenant.id, 'write');
    const { token } = await loginAs(user.email, password);
    return { tenant, user, password, token };
  }

  it('GET /api/tenants → 423 with PASSWORD_RESET_REQUIRED', async () => {
    const { token } = await setupLockedUser();
    const res = await api().get('/api/tenants').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(423);
    expect(res.body.code).toBe('PASSWORD_RESET_REQUIRED');
    expect(res.body.success).toBe(false);
  });

  it('GET /api/tenants/:slug/workspaces → 423', async () => {
    const { token, tenant } = await setupLockedUser();
    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(423);
    expect(res.body.code).toBe('PASSWORD_RESET_REQUIRED');
  });

  it('GET /api/auth/profile → 200 (escape hatch)', async () => {
    const { token, user } = await setupLockedUser();
    const res = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Profile surfaces the locked flag so the FE can show the must-reset UI.
    // The route returns { user, tenants } so the user lives at data.user.
    expect(res.body.data.user.id).toBe(user.id);
    expect(res.body.data.user.mustResetPassword).toBe(true);
  });

  it('POST /api/auth/change-password (valid body) → 200, flag cleared', async () => {
    const { token } = await setupLockedUser();
    const res = await api()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'temppass1234', newPassword: 'rotatedpass2' });
    expect(res.status).toBe(200);
    expect(res.body.data.mustResetPassword).toBe(false);
  });

  it('after change-password, GET /api/tenants → 200', async () => {
    const { token } = await setupLockedUser();

    await api()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'temppass1234', newPassword: 'rotatedpass2' })
      .expect(200);

    const res = await api().get('/api/tenants').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
