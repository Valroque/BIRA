import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { addTenantMember, createTenant, createUser, loginAs } from '../helpers/factories.js';

describe('POST /api/auth/change-password', () => {
  it('401 when unauthenticated', async () => {
    const res = await api()
      .post('/api/auth/change-password')
      .send({ currentPassword: 'whatever', newPassword: 'newpassword1' });
    expect(res.status).toBe(401);
  });

  it('401 when currentPassword is wrong', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'not-it', newPassword: 'newpassword1' });

    expect(res.status).toBe(401);
  });

  it('400 when newPassword === currentPassword', async () => {
    const { user, password } = await createUser({ password: 'samepass1' });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'samepass1', newPassword: 'samepass1' });

    expect(res.status).toBe(400);
  });

  it('400 when newPassword is shorter than 8 chars', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword: 'short' });

    expect(res.status).toBe(400);
  });

  it('200 happy path: clears mustResetPassword; old pwd fails, new pwd works', async () => {
    const { user, password } = await createUser({ password: 'originalpass1' });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'originalpass1', newPassword: 'rotatedpass2' });

    expect(res.status).toBe(200);
    expect(res.body.data.mustResetPassword).toBe(false);

    // Old password fails — exercise the HTTP login route to be thorough.
    const oldLogin = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'originalpass1' });
    expect(oldLogin.status).toBe(401);

    // New password succeeds.
    const newLogin = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'rotatedpass2' });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.data.user.id).toBe(user.id);
  });

  it('clears mustResetPassword for a user starting locked; /api/tenants reachable after', async () => {
    const { user, password } = await createUser({
      password: 'temppass1234',
      mustReset: true,
    });
    // Add to a tenant so /api/tenants would otherwise return rows.
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');

    const { token } = await loginAs(user.email, password);

    // Sanity check: locked → /api/tenants is 423.
    const lockedTenants = await api()
      .get('/api/tenants')
      .set('Authorization', `Bearer ${token}`);
    expect(lockedTenants.status).toBe(423);

    const res = await api()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'temppass1234', newPassword: 'realpass1234' });

    expect(res.status).toBe(200);
    expect(res.body.data.mustResetPassword).toBe(false);

    // After clearing, /api/tenants succeeds with the same access token —
    // authenticate() refetches the user row each request, so the cleared
    // flag is observed without re-login.
    const afterTenants = await api()
      .get('/api/tenants')
      .set('Authorization', `Bearer ${token}`);
    expect(afterTenants.status).toBe(200);
  });
});
