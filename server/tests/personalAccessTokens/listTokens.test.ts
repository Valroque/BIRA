import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { createUser, loginAs, createPat } from '../helpers/factories.js';

describe('GET /api/auth/tokens', () => {
  it('200 returns the user\'s tokens; never exposes tokenHash or plaintext', async () => {
    const { user, password } = await createUser();
    await createPat({ userId: user.id, name: 'a' });
    await createPat({ userId: user.id, name: 'b' });
    const { token: jwt } = await loginAs(user.email, password);

    const res = await api()
      .get('/api/auth/tokens')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);

    for (const row of res.body.data) {
      expect(row.userId).toBe(user.id);
      expect(row.tokenHash).toBeUndefined();
      expect(row.token_hash).toBeUndefined();
      // No plaintext anywhere on the list view — it only ever appears in
      // the create response.
      expect(row.plaintext).toBeUndefined();
      expect(typeof row.last4).toBe('string');
      expect(row.last4.length).toBe(4);
    }
  });

  it('401 with no Authorization header', async () => {
    const res = await api().get('/api/auth/tokens');
    expect(res.status).toBe(401);
  });

  it('200 returns the caller\'s tokens when authed via a PAT bearer', async () => {
    const { user } = await createUser();
    const { plaintext, token } = await createPat({ userId: user.id });

    const res = await api()
      .get('/api/auth/tokens')
      .set('Authorization', `Bearer ${plaintext}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(token.id);
    // Read-via-PAT must still scrub the secret.
    expect(res.body.data[0]).not.toHaveProperty('tokenHash');
    expect(JSON.stringify(res.body)).not.toContain(plaintext);
  });

  it('does not surface other users\' tokens', async () => {
    const { user: alice, password: alicePwd } = await createUser({
      email: 'alice@test.local',
    });
    const { user: bob } = await createUser({ email: 'bob@test.local' });

    await createPat({ userId: alice.id, name: 'alice-1' });
    await createPat({ userId: bob.id, name: 'bob-1' });

    const { token: jwt } = await loginAs(alice.email, alicePwd);
    const res = await api()
      .get('/api/auth/tokens')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('alice-1');
  });

  it('includes revoked tokens with revokedAt set (audit trail)', async () => {
    const { user, password } = await createUser();
    const { token } = await createPat({ userId: user.id, name: 'to-revoke' });
    const { token: jwt } = await loginAs(user.email, password);

    // Revoke via the API so the test exercises the same path the user does.
    const revokeRes = await api()
      .delete(`/api/auth/tokens/${token.id}`)
      .set('Authorization', `Bearer ${jwt}`);
    expect(revokeRes.status).toBe(200);

    const res = await api()
      .get('/api/auth/tokens')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('to-revoke');
    expect(res.body.data[0].revokedAt).not.toBeNull();
  });

  it('200 empty array when the user has no tokens', async () => {
    const { user, password } = await createUser();
    const { token: jwt } = await loginAs(user.email, password);

    const res = await api()
      .get('/api/auth/tokens')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
