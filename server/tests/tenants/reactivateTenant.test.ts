import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { addTenantMember, createTenant, createUser, loginAs } from '../helpers/factories.js';
import * as tenantService from '../../src/services/tenantService.js';

describe('POST /api/tenants/:tenantSlug/reactivate', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const res = await api().post(`/api/tenants/${tenant.slug}/reactivate`);
    expect(res.status).toBe(401);
  });

  it('403 when caller is write (not admin)', async () => {
    const tenant = await createTenant();
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'write');

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/reactivate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('403 when caller is read', async () => {
    const tenant = await createTenant();
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'read');

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/reactivate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('200 happy path: deactivate then reactivate flips status back and tenant returns to default list', async () => {
    const tenant = await createTenant({ slug: 'round-trip' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');

    const { token } = await loginAs(user.email, password);

    const deact = await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(deact.status).toBe(200);

    const react = await api()
      .post(`/api/tenants/${tenant.slug}/reactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(react.status).toBe(200);
    expect(react.body.data.status).toBe('active');

    const list = await api()
      .get('/api/tenants')
      .set('Authorization', `Bearer ${token}`);
    const slugs = list.body.data.map(
      (item: { tenant: { slug: string } }) => item.tenant.slug
    );
    expect(slugs).toContain('round-trip');
  });

  it('200 reactivation succeeds while tenant is currently deactivated (escape hatch)', async () => {
    const tenant = await createTenant({ slug: 'escape-hatch' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');

    // Flip directly via service so we exercise the route purely on a
    // pre-deactivated tenant — proves requireActiveTenant is NOT gating it.
    await tenantService.setStatus(tenant.id, 'deactivated');

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/reactivate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  it('200 idempotent on an already-active tenant', async () => {
    const tenant = await createTenant({ slug: 'still-active' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/reactivate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });
});
