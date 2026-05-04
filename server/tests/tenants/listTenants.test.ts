import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { addTenantMember, createTenant, createUser, loginAs } from '../helpers/factories.js';
import * as tenantService from '../../src/services/tenantService.js';

describe('GET /api/tenants', () => {
  it('401 when unauthenticated', async () => {
    const res = await api().get('/api/tenants');
    expect(res.status).toBe(401);
  });

  it('200 returns only tenants the caller is a member of', async () => {
    const a = await createUser();
    const b = await createUser();
    const t1 = await createTenant({ slug: 't-one', name: 'T One' });
    const t2 = await createTenant({ slug: 't-two', name: 'T Two' });
    const t3 = await createTenant({ slug: 't-three', name: 'T Three' });
    await addTenantMember(a.user.id, t1.id, 'admin');
    await addTenantMember(a.user.id, t2.id, 'write');
    await addTenantMember(b.user.id, t3.id, 'admin');

    const { token } = await loginAs(a.user.email, a.password);

    const res = await api()
      .get('/api/tenants')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const slugs = res.body.data.map((item: { tenant: { slug: string } }) => item.tenant.slug);
    expect(slugs).toContain('t-one');
    expect(slugs).toContain('t-two');
    expect(slugs).not.toContain('t-three');
    expect(res.body.data).toHaveLength(2);
  });

  it('200 with empty list when caller has no memberships', async () => {
    const { user, password } = await createUser();
    // Tenant exists but caller is not a member of it.
    await createTenant();

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get('/api/tenants')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('200 hides deactivated tenants by default and surfaces them with includeDeactivated=true', async () => {
    const { user, password } = await createUser();
    const liveTenant = await createTenant({ slug: 'live-co', name: 'Live Co' });
    const deadTenant = await createTenant({ slug: 'dead-co', name: 'Dead Co' });
    await addTenantMember(user.id, liveTenant.id, 'admin');
    await addTenantMember(user.id, deadTenant.id, 'admin');

    await tenantService.setStatus(deadTenant.id, 'deactivated');

    const { token } = await loginAs(user.email, password);

    const defaultRes = await api()
      .get('/api/tenants')
      .set('Authorization', `Bearer ${token}`);
    expect(defaultRes.status).toBe(200);
    const defaultSlugs = defaultRes.body.data.map(
      (item: { tenant: { slug: string } }) => item.tenant.slug
    );
    expect(defaultSlugs).toContain('live-co');
    expect(defaultSlugs).not.toContain('dead-co');

    const includeRes = await api()
      .get('/api/tenants?includeDeactivated=true')
      .set('Authorization', `Bearer ${token}`);
    expect(includeRes.status).toBe(200);
    const includeSlugs = includeRes.body.data.map(
      (item: { tenant: { slug: string } }) => item.tenant.slug
    );
    expect(includeSlugs).toContain('live-co');
    expect(includeSlugs).toContain('dead-co');
  });

  it('200 each item carries the caller-specific role', async () => {
    const { user, password } = await createUser();
    const tAdmin = await createTenant({ slug: 'as-admin' });
    const tWrite = await createTenant({ slug: 'as-write' });
    await addTenantMember(user.id, tAdmin.id, 'admin');
    await addTenantMember(user.id, tWrite.id, 'write');

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get('/api/tenants')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const bySlug = new Map(
      res.body.data.map((item: { tenant: { slug: string }; role: string }) => [
        item.tenant.slug,
        item.role,
      ])
    );
    expect(bySlug.get('as-admin')).toBe('admin');
    expect(bySlug.get('as-write')).toBe('write');
  });
});
