import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { createTenant, createUser, loginAs } from '../helpers/factories.js';

const validBody = (overrides: Record<string, unknown> = {}) => ({
  slug: 'new-co',
  name: 'New Co',
  letter: 'N',
  color: '#4f46e5',
  bg: '#e0e7ff',
  ...overrides,
});

describe('POST /api/tenants', () => {
  it('401 when unauthenticated', async () => {
    const res = await api().post('/api/tenants').send(validBody());
    expect(res.status).toBe(401);
  });

  it('201 happy path: returns tenant with given fields, default plan, active status, and grants creator admin', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody({ slug: 'fresh-co', name: 'Fresh Co', letter: 'F' }));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.slug).toBe('fresh-co');
    expect(res.body.data.name).toBe('Fresh Co');
    expect(res.body.data.letter).toBe('F');
    expect(res.body.data.color).toBe('#4f46e5');
    expect(res.body.data.bg).toBe('#e0e7ff');
    expect(res.body.data.plan).toBe('free');
    expect(res.body.data.status).toBe('active');

    // Detail endpoint requires membership; a 200 here proves creator was
    // granted admin in the same transaction.
    const detail = await api()
      .get('/api/tenants/fresh-co')
      .set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.role).toBe('admin');
  });

  it('201 honors plan override when provided', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody({ slug: 'paid-co', plan: 'pro' }));

    expect(res.status).toBe(201);
    expect(res.body.data.plan).toBe('pro');
  });

  it('409 when slug already exists', async () => {
    await createTenant({ slug: 'taken' });
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody({ slug: 'taken' }));

    expect(res.status).toBe(409);
  });

  it('400 when slug has uppercase characters', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody({ slug: 'NotLower' }));

    expect(res.status).toBe(400);
  });

  it('400 when slug starts with a dash', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody({ slug: '-leading' }));

    expect(res.status).toBe(400);
  });

  it('400 when name is missing', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const body = validBody();
    delete (body as Record<string, unknown>).name;

    const res = await api()
      .post('/api/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('400 when letter is missing', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const body = validBody();
    delete (body as Record<string, unknown>).letter;

    const res = await api()
      .post('/api/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('400 when color is missing', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const body = validBody();
    delete (body as Record<string, unknown>).color;

    const res = await api()
      .post('/api/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('400 when bg is missing', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const body = validBody();
    delete (body as Record<string, unknown>).bg;

    const res = await api()
      .post('/api/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('400 when slug exceeds 64 chars', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const longSlug = 'a'.repeat(65);

    const res = await api()
      .post('/api/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody({ slug: longSlug }));

    expect(res.status).toBe(400);
  });

  it('200 newly created tenant appears in caller GET /api/tenants', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const create = await api()
      .post('/api/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody({ slug: 'just-made', name: 'Just Made' }));
    expect(create.status).toBe(201);

    const list = await api()
      .get('/api/tenants')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    // GET /api/tenants is the public pre-login picker — flat Tenant[].
    const slugs = list.body.data.map((item: { slug: string }) => item.slug);
    expect(slugs).toContain('just-made');
  });
});
