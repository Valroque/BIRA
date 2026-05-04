import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { addTenantMember, createTenant, createUser, loginAs } from '../helpers/factories.js';

const validWorkspaceBody = {
  slug: 'team-alpha',
  name: 'Team Alpha',
  letter: 'A',
  color: '#4f46e5',
  bg: '#e0e7ff',
};

describe('POST /api/tenants/:tenantSlug/deactivate', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const res = await api().post(`/api/tenants/${tenant.slug}/deactivate`);
    expect(res.status).toBe(401);
  });

  it('403 when caller is write (not admin)', async () => {
    const tenant = await createTenant();
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'write');

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('403 when caller is read', async () => {
    const tenant = await createTenant();
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'read');

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('404 for unknown tenant slug (admin caller in another tenant)', async () => {
    const real = await createTenant({ slug: 'real-co' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, real.id, 'admin');

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post('/api/tenants/no-such-tenant/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('200 happy path: status flips and visibility in GET /api/tenants follows includeDeactivated', async () => {
    const tenant = await createTenant({ slug: 'soon-frozen' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('deactivated');

    const defaultList = await api()
      .get('/api/tenants')
      .set('Authorization', `Bearer ${token}`);
    const defaultSlugs = defaultList.body.data.map(
      (item: { tenant: { slug: string } }) => item.tenant.slug
    );
    expect(defaultSlugs).not.toContain('soon-frozen');

    const fullList = await api()
      .get('/api/tenants?includeDeactivated=true')
      .set('Authorization', `Bearer ${token}`);
    const fullSlugs = fullList.body.data.map(
      (item: { tenant: { slug: string } }) => item.tenant.slug
    );
    expect(fullSlugs).toContain('soon-frozen');
  });

  it('409 on workspace create after deactivation (requireActiveTenant gate)', async () => {
    const tenant = await createTenant({ slug: 'gated-co' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');

    const { token } = await loginAs(user.email, password);

    const deact = await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(deact.status).toBe(200);

    const create = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send(validWorkspaceBody);

    expect(create.status).toBe(409);
  });

  it('200 idempotent on an already-deactivated tenant', async () => {
    const tenant = await createTenant({ slug: 'twice-frozen' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');

    const { token } = await loginAs(user.email, password);

    const first = await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);

    // Route intentionally NOT behind requireActiveTenant — second call works.
    const second = await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('deactivated');
  });
});
