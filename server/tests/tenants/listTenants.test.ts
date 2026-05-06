import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { createTenant, createUser, loginAs } from '../helpers/factories.js';
import * as tenantService from '../../src/services/tenantService.js';

describe('GET /api/tenants', () => {
  it('200 unauthenticated — returns all active tenants', async () => {
    const t1 = await createTenant({ slug: 't-one', name: 'T One' });
    const t2 = await createTenant({ slug: 't-two', name: 'T Two' });

    const res = await api().get('/api/tenants');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const slugs = res.body.data.map((t: { slug: string }) => t.slug);
    expect(slugs).toContain(t1.slug);
    expect(slugs).toContain(t2.slug);
  });

  it('200 authenticated — same response shape; auth header is ignored', async () => {
    const { user, password } = await createUser();
    const t1 = await createTenant({ slug: 'auth-one' });
    await createTenant({ slug: 'auth-two' });

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get('/api/tenants')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const slugs = res.body.data.map((t: { slug: string }) => t.slug);
    expect(slugs).toContain('auth-one');
    expect(slugs).toContain('auth-two');
    // No role wrapper — items are plain tenant objects.
    expect(res.body.data[0]).not.toHaveProperty('role');
    expect(res.body.data[0]).not.toHaveProperty('tenant');
    expect(res.body.data[0]).toHaveProperty('id');
    expect(res.body.data[0]).toHaveProperty('slug');
    expect(res.body.data[0]).toHaveProperty('name');
  });

  it('200 returns tenants the caller is NOT a member of', async () => {
    // The public picker doesn't filter by membership — that's its whole point.
    const { user, password } = await createUser();
    const someone = await createTenant({ slug: 'not-mine', name: 'Not Mine' });

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get('/api/tenants')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const slugs = res.body.data.map((t: { slug: string }) => t.slug);
    expect(slugs).toContain(someone.slug);
  });

  it('200 hides deactivated tenants', async () => {
    const live = await createTenant({ slug: 'live-co', name: 'Live Co' });
    const dead = await createTenant({ slug: 'dead-co', name: 'Dead Co' });
    await tenantService.setStatus(dead.id, 'deactivated');

    const res = await api().get('/api/tenants');

    expect(res.status).toBe(200);
    const slugs = res.body.data.map((t: { slug: string }) => t.slug);
    expect(slugs).toContain(live.slug);
    expect(slugs).not.toContain(dead.slug);
  });

  it('200 ignores includeDeactivated query param (deactivated never surface here)', async () => {
    const dead = await createTenant({ slug: 'dead-pub' });
    await tenantService.setStatus(dead.id, 'deactivated');

    const res = await api().get('/api/tenants?includeDeactivated=true');

    expect(res.status).toBe(200);
    const slugs = res.body.data.map((t: { slug: string }) => t.slug);
    expect(slugs).not.toContain(dead.slug);
  });
});
