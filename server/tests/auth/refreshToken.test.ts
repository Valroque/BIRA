import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { createUser } from '../helpers/factories.js';
import { generateToken } from '../../src/middleware/auth.js';

describe('POST /api/auth/refresh-token', () => {
  it('200 happy path: returns a new token; new token works on /profile', async () => {
    const reg = await api().post('/api/auth/register').send({
      email: 'refresh-ok@test.local',
      password: 'password123',
      firstName: 'Refresh',
      lastName: 'Ok',
    });
    expect(reg.status).toBe(201);
    const { refreshToken } = reg.body.data;

    const res = await api().post('/api/auth/refresh-token').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');

    const profile = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${res.body.data.token}`);
    expect(profile.status).toBe(200);
  });

  it('401 with a malformed refresh token', async () => {
    const res = await api()
      .post('/api/auth/refresh-token')
      .send({ refreshToken: 'not-a-jwt' });
    expect(res.status).toBe(401);
  });

  it('401 when an access token is passed as a refresh token', async () => {
    // generateToken signs with JWT_SECRET (not _REFRESH_SECRET) and lacks
    // type:'refresh', so verifyRefreshToken should reject it on both axes.
    const { user } = await createUser();
    const accessToken = generateToken(user.id);

    const res = await api()
      .post('/api/auth/refresh-token')
      .send({ refreshToken: accessToken });
    expect(res.status).toBe(401);
  });

  it('400 when refreshToken field is missing', async () => {
    const res = await api().post('/api/auth/refresh-token').send({});
    expect(res.status).toBe(400);
  });
});
