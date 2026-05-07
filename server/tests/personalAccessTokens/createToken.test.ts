import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { createUser, loginAs, createPat } from '../helpers/factories.js';

describe('POST /api/auth/tokens', () => {
  it('201 happy path: returns plaintext + entity, response excludes tokenHash', async () => {
    const { user, password } = await createUser({ email: 'pat-create@test.local' });
    const { token: jwt } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/auth/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'ci-bot', expiresIn: 'never' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.token.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(res.body.data.token.userId).toBe(user.id);
    expect(res.body.data.token.name).toBe('ci-bot');
    expect(res.body.data.token.last4.length).toBe(4);
    expect(res.body.data.token.expiresAt).toBeNull();
    expect(res.body.data.token.revokedAt).toBeNull();

    // Plaintext shape: starts with `bira_pat_`, last4 matches.
    const plaintext: string = res.body.data.plaintext;
    expect(typeof plaintext).toBe('string');
    expect(plaintext.startsWith('bira_pat_')).toBe(true);
    expect(plaintext.slice(-4)).toBe(res.body.data.token.last4);

    // Entity must NEVER carry tokenHash (security-relevant).
    expect(res.body.data.token.tokenHash).toBeUndefined();
    expect(res.body.data.token.token_hash).toBeUndefined();
  });

  it('201 happy path with expiresIn=30d: expiresAt set ~30d in future', async () => {
    const { user, password } = await createUser();
    const { token: jwt } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/auth/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'short-lived', expiresIn: '30d' });

    expect(res.status).toBe(201);
    expect(res.body.data.token.expiresAt).toBeTruthy();
    const expiresAt = new Date(res.body.data.token.expiresAt).getTime();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThan(now + 29 * day);
    expect(expiresAt).toBeLessThan(now + 31 * day);
  });

  it('401 with no Authorization header', async () => {
    const res = await api().post('/api/auth/tokens').send({
      name: 'nope',
      expiresIn: 'never',
    });
    expect(res.status).toBe(401);
  });

  it('403 PAT_CANNOT_MINT_PAT when called via PAT bearer', async () => {
    const { user } = await createUser();
    const { plaintext } = await createPat({ userId: user.id });

    const res = await api()
      .post('/api/auth/tokens')
      .set('Authorization', `Bearer ${plaintext}`)
      .send({ name: 'minted-by-pat', expiresIn: 'never' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PAT_CANNOT_MINT_PAT');
  });

  it('422 PAT_LIMIT_REACHED on the 11th create', async () => {
    const { user, password } = await createUser();
    const { token: jwt } = await loginAs(user.email, password);

    // Mint 10 via the factory (uses the same usecase).
    for (let i = 0; i < 10; i++) {
      await createPat({ userId: user.id, name: `pat-${i}` });
    }

    const res = await api()
      .post('/api/auth/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'pat-11', expiresIn: 'never' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PAT_LIMIT_REACHED');
  });

  it('400 on invalid expiresIn', async () => {
    const { user, password } = await createUser();
    const { token: jwt } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/auth/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'bad-expiry', expiresIn: '5m' });

    expect(res.status).toBe(400);
  });

  it('400 on empty name', async () => {
    const { user, password } = await createUser();
    const { token: jwt } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/auth/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: '', expiresIn: 'never' });

    expect(res.status).toBe(400);
  });

  it('400 on name longer than 64 chars', async () => {
    const { user, password } = await createUser();
    const { token: jwt } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/auth/tokens')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ name: 'a'.repeat(65), expiresIn: 'never' });

    expect(res.status).toBe(400);
  });
});
