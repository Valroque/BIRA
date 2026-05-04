import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { createUser } from '../helpers/factories.js';
// `userService.update` doesn't accept isActive; reach into the DB
// for the inactive-user case so we don't bypass the rest of the service layer.
import { db } from '../../src/db/knex.js';

describe('POST /api/auth/login', () => {
  it('200 happy path: token works on /profile, refreshToken differs from access', async () => {
    const { user, password } = await createUser({ email: 'login-ok@test.local' });

    const res = await api().post('/api/auth/login').send({
      email: user.email,
      password,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBe(user.id);
    expect(typeof res.body.data.token).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
    expect(res.body.data.token).not.toBe(res.body.data.refreshToken);

    const profile = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${res.body.data.token}`);
    expect(profile.status).toBe(200);
  });

  it('401 with wrong password', async () => {
    const { user } = await createUser({ password: 'realpass1' });
    const res = await api().post('/api/auth/login').send({
      email: user.email,
      password: 'wrong-pwd',
    });
    expect(res.status).toBe(401);
  });

  it('401 with unknown email', async () => {
    const res = await api().post('/api/auth/login').send({
      email: 'no-such@test.local',
      password: 'whatever1',
    });
    expect(res.status).toBe(401);
  });

  it('401 when user is deactivated', async () => {
    const { user, password } = await createUser({ email: 'inactive@test.local' });
    await db('users').where({ id: user.id }).update({ isActive: false });

    const res = await api().post('/api/auth/login').send({
      email: user.email,
      password,
    });
    expect(res.status).toBe(401);
  });

  it('400 when email is missing', async () => {
    const res = await api().post('/api/auth/login').send({ password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('400 when password is missing', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'someone@test.local' });
    expect(res.status).toBe(400);
  });
});
