import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { createUser, loginAs } from '../helpers/factories.js';
import { db } from '../../src/db/knex.js';

describe('GET /api/auth/profile', () => {
  it('200 happy path returns { user, tenants } shape', async () => {
    const { user, password } = await createUser({
      email: 'profile-ok@test.local',
      firstName: 'Pro',
      lastName: 'File',
    });
    const { token } = await loginAs(user.email, password);

    const res = await api().get('/api/auth/profile').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBe(user.id);
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.user.firstName).toBe('Pro');
    expect(res.body.data.user.lastName).toBe('File');
    expect(Array.isArray(res.body.data.tenants)).toBe(true);
  });

  it('401 with no Authorization header', async () => {
    const res = await api().get('/api/auth/profile');
    expect(res.status).toBe(401);
  });

  it('401 with a malformed token', async () => {
    const res = await api()
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('401 when the user has been deactivated after the token was issued', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);
    await db('users').where({ id: user.id }).update({ isActive: false });

    const res = await api().get('/api/auth/profile').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('200 still works for a locked user (mustResetPassword)', async () => {
    // The auth router intentionally does NOT mount requirePasswordResetCleared
    // — locked users must be able to discover that they are locked.
    const { user, password } = await createUser({
      password: 'temppass1234',
      mustReset: true,
    });
    const { token } = await loginAs(user.email, password);

    const res = await api().get('/api/auth/profile').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.mustResetPassword).toBe(true);
  });
});
