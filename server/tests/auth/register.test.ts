import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { createUser } from '../helpers/factories.js';

describe('POST /api/auth/register', () => {
  it('201 happy path returns user + token + refreshToken; email lowercased', async () => {
    const res = await api().post('/api/auth/register').send({
      email: 'New.User@Test.LOCAL',
      password: 'password123',
      firstName: 'New',
      lastName: 'User',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('new.user@test.local');
    expect(res.body.data.user.mustResetPassword).toBe(false);
    expect(typeof res.body.data.token).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
    expect(res.body.data.token.length).toBeGreaterThan(0);
  });

  it('returned token authenticates against /api/auth/profile', async () => {
    const reg = await api().post('/api/auth/register').send({
      email: 'reg-then-profile@test.local',
      password: 'password123',
      firstName: 'Reg',
      lastName: 'Profile',
    });
    expect(reg.status).toBe(201);

    const profile = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${reg.body.data.token}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.user.email).toBe('reg-then-profile@test.local');
  });

  it('409 when the email is already taken', async () => {
    await createUser({ email: 'taken@test.local' });

    const res = await api().post('/api/auth/register').send({
      email: 'taken@test.local',
      password: 'password123',
      firstName: 'Dup',
      lastName: 'User',
    });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('400 on invalid email', async () => {
    const res = await api().post('/api/auth/register').send({
      email: 'not-an-email',
      password: 'password123',
      firstName: 'Bad',
      lastName: 'Email',
    });
    expect(res.status).toBe(400);
  });

  it('400 when password is shorter than 8 chars', async () => {
    const res = await api().post('/api/auth/register').send({
      email: 'short-pwd@test.local',
      password: 'short',
      firstName: 'Short',
      lastName: 'Pwd',
    });
    expect(res.status).toBe(400);
  });

  it('400 when firstName is missing', async () => {
    const res = await api().post('/api/auth/register').send({
      email: 'no-first@test.local',
      password: 'password123',
      lastName: 'NoFirst',
    });
    expect(res.status).toBe(400);
  });

  it('400 when lastName is missing', async () => {
    const res = await api().post('/api/auth/register').send({
      email: 'no-last@test.local',
      password: 'password123',
      firstName: 'NoLast',
    });
    expect(res.status).toBe(400);
  });
});
