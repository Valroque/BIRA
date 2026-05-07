import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { createUser, loginAs, createPat } from '../helpers/factories.js';

describe('DELETE /api/auth/tokens/:id', () => {
  it('200 happy path; subsequent list shows the row with revokedAt set', async () => {
    const { user, password } = await createUser();
    const { token } = await createPat({ userId: user.id, name: 'to-revoke' });
    const { token: jwt } = await loginAs(user.email, password);

    const res = await api()
      .delete(`/api/auth/tokens/${token.id}`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(token.id);

    const list = await api()
      .get('/api/auth/tokens')
      .set('Authorization', `Bearer ${jwt}`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].revokedAt).not.toBeNull();
  });

  it('401 with no Authorization header', async () => {
    const { user } = await createUser();
    const { token } = await createPat({ userId: user.id });

    const res = await api().delete(`/api/auth/tokens/${token.id}`);
    expect(res.status).toBe(401);
  });

  it('403 PAT_CANNOT_MINT_PAT when called via PAT bearer', async () => {
    const { user } = await createUser();
    const { token, plaintext } = await createPat({ userId: user.id, name: 'self' });

    const res = await api()
      .delete(`/api/auth/tokens/${token.id}`)
      .set('Authorization', `Bearer ${plaintext}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PAT_CANNOT_MINT_PAT');
  });

  it('400 when id is not a uuid', async () => {
    const { user, password } = await createUser();
    const { token: jwt } = await loginAs(user.email, password);

    const res = await api()
      .delete('/api/auth/tokens/not-a-uuid')
      .set('Authorization', `Bearer ${jwt}`);
    expect(res.status).toBe(400);
  });

  it('404 PAT_NOT_FOUND on a bogus uuid', async () => {
    const { user, password } = await createUser();
    const { token: jwt } = await loginAs(user.email, password);

    const res = await api()
      .delete('/api/auth/tokens/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PAT_NOT_FOUND');
  });

  it("404 PAT_NOT_FOUND when revoking another user's token", async () => {
    const { user: alice, password: alicePwd } = await createUser({
      email: 'alice@test.local',
    });
    const { user: bob } = await createUser({ email: 'bob@test.local' });
    const { token: bobToken } = await createPat({ userId: bob.id });

    const { token: aliceJwt } = await loginAs(alice.email, alicePwd);
    const res = await api()
      .delete(`/api/auth/tokens/${bobToken.id}`)
      .set('Authorization', `Bearer ${aliceJwt}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PAT_NOT_FOUND');
  });

  it('idempotent-ish: second revoke returns 404 PAT_NOT_FOUND', async () => {
    const { user, password } = await createUser();
    const { token } = await createPat({ userId: user.id });
    const { token: jwt } = await loginAs(user.email, password);

    const first = await api()
      .delete(`/api/auth/tokens/${token.id}`)
      .set('Authorization', `Bearer ${jwt}`);
    expect(first.status).toBe(200);

    const second = await api()
      .delete(`/api/auth/tokens/${token.id}`)
      .set('Authorization', `Bearer ${jwt}`);
    expect(second.status).toBe(404);
    expect(second.body.code).toBe('PAT_NOT_FOUND');
  });
});
