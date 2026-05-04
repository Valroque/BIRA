import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { createUser, loginAs } from '../helpers/factories.js';

describe('PATCH /api/auth/me', () => {
  it('401 when unauthenticated', async () => {
    const res = await api().patch('/api/auth/me').send({ firstName: 'Nope' });
    expect(res.status).toBe(401);
  });

  it('200 returns the updated user when authenticated', async () => {
    const { user, password } = await createUser({
      email: 'edit-me@test.local',
      firstName: 'Old',
      lastName: 'Name',
    });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'New',
        lastName: 'Person',
        phone: '+1-555-9999',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(user.id);
    expect(res.body.data.firstName).toBe('New');
    expect(res.body.data.lastName).toBe('Person');
    expect(res.body.data.phone).toBe('+1-555-9999');
  });

  it('200 when changing email to a free address; the new email can log in', async () => {
    const { user, password } = await createUser({ email: 'old@test.local' });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'new@test.local' });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('new@test.local');

    // New email logs in cleanly.
    const after = await loginAs('new@test.local', password);
    expect(after.user.id).toBe(user.id);
    expect(after.user.email).toBe('new@test.local');
  });

  it('409 when changing email to one another user already owns', async () => {
    await createUser({ email: 'taken@test.local' });
    const { user, password } = await createUser({ email: 'mine@test.local' });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'taken@test.local' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('400 when body is empty (Zod refine)', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('phone can be set to null to clear it', async () => {
    const { user, password } = await createUser({ phone: '+1-555-0000' });
    const { token } = await loginAs(user.email, password);

    expect(user.phone).toBe('+1-555-0000');

    const res = await api()
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: null });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBeNull();
  });
});
