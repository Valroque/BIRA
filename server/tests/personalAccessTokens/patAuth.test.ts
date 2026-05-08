import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import {
  addTenantMember,
  createPat,
  createTenant,
  createUser,
} from '../helpers/factories.js';
// Direct DB writes are reserved for cases where the service layer doesn't
// expose the path: setting an inactive user, planting a past expires_at on
// a PAT. Mirrors the existing pattern in tests/auth/login.test.ts.
import { db } from '../../src/db/knex.js';

describe('PAT authentication — middleware end-to-end', () => {
  it('GET /api/auth/profile authed via PAT resolves to the right user', async () => {
    const { user } = await createUser({ email: 'pat-profile@test.local' });
    const { plaintext } = await createPat({ userId: user.id });

    const res = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${plaintext}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);
    expect(res.body.data.user.email).toBe(user.email);
  });

  it('Revoked PAT → 401', async () => {
    const { user, password } = await createUser();
    const { token } = await createPat({ userId: user.id });

    // Revoke via the route so the test exercises the same path the user
    // does — needs JWT auth for the revoke (PATs can't manage themselves).
    const loginRes = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password });
    const jwt: string = loginRes.body.data.token;
    const revokeRes = await api()
      .delete(`/api/auth/tokens/${token.id}`)
      .set('Authorization', `Bearer ${jwt}`);
    expect(revokeRes.status).toBe(200);

    // Now try to use the revoked PAT.
    const { plaintext } = await createPat({
      userId: user.id,
      name: 'second',
    });
    // Sanity: the new (active) PAT works…
    const ok = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${plaintext}`);
    expect(ok.status).toBe(200);

    // …and re-fetching the revoked one returns 401. Re-derive the
    // plaintext is impossible (by design), so we instead grab the
    // plaintext from the create response we already have above. Re-do:
    const { token: t2, plaintext: pt2 } = await createPat({
      userId: user.id,
      name: 'to-revoke',
    });
    await api()
      .delete(`/api/auth/tokens/${t2.id}`)
      .set('Authorization', `Bearer ${jwt}`);

    const blocked = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${pt2}`);
    expect(blocked.status).toBe(401);
  });

  it('Expired PAT → 401', async () => {
    const { user } = await createUser();
    const { token, plaintext } = await createPat({ userId: user.id });

    // Service-layer doesn't allow planting a past expires_at, so reach
    // into the DB. The request must not be able to authenticate with a
    // PAT whose expires_at has passed.
    await db('personal_access_tokens')
      .where({ id: token.id })
      .update({ expiresAt: new Date(Date.now() - 60_000) });

    const res = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${plaintext}`);

    expect(res.status).toBe(401);
  });

  it('PAT for inactive owner → 401', async () => {
    const { user } = await createUser();
    const { plaintext } = await createPat({ userId: user.id });

    await db('users').where({ id: user.id }).update({ isActive: false });

    const res = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${plaintext}`);

    expect(res.status).toBe(401);
  });

  it('PAT for locked-out owner → 423 PASSWORD_RESET_REQUIRED on a /api/tenants/:t route', async () => {
    // Set up a tenant the user is a member of so the route resolves.
    const tenant = await createTenant();
    const { user } = await createUser({
      password: 'temppass1234',
      mustReset: true,
    });
    await addTenantMember(user.id, tenant.id, 'write');
    const { plaintext } = await createPat({ userId: user.id });

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${plaintext}`);

    expect(res.status).toBe(423);
    expect(res.body.code).toBe('PASSWORD_RESET_REQUIRED');
  });

  it('PAT for locked-out owner → 200 on /api/auth/profile (escape hatch unchanged)', async () => {
    // Mirrors the JWT-side "locked user can still hit /profile to discover
    // they're locked." PATs flow through the same gate, which means they
    // also get the same escape hatch.
    const { user } = await createUser({
      password: 'temppass1234',
      mustReset: true,
    });
    const { plaintext } = await createPat({ userId: user.id });

    const res = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${plaintext}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.mustResetPassword).toBe(true);
  });

  it('Invalid PAT (right prefix, wrong content) → 401', async () => {
    const res = await api()
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer bira_pat_definitely_not_a_real_token');

    expect(res.status).toBe(401);
  });

  it('PAT bumps last_used_at on use', async () => {
    const { user } = await createUser();
    const { token, plaintext } = await createPat({ userId: user.id });

    // Brand-new PAT has lastUsedAt = null.
    expect(token.lastUsedAt).toBeNull();

    const res = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${plaintext}`);
    expect(res.status).toBe(200);

    // The middleware fires touchLastUsed after auth succeeds. Give it a
    // moment to land — the write is fire-and-forget, so we poll rather
    // than assume it's already done. knex-stringcase maps the
    // `last_used_at` column to `lastUsedAt` on read.
    let lastUsed: Date | string | null = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const row = await db('personal_access_tokens')
        .where({ id: token.id })
        .first<{ lastUsedAt: Date | string | null }>();
      lastUsed = row?.lastUsedAt ?? null;
      if (lastUsed !== null) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(lastUsed).not.toBeNull();
  });
});
