import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { addTenantMember, createTenant, createUser, loginAs } from '../helpers/factories.js';
import * as tenantService from '../../src/services/tenantService.js';

describe('GET /api/tenants/:tenantSlug', () => {
  it('200 happy path returns id, slug, and caller role', async () => {
    const tenant = await createTenant({ slug: 'detail-co' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'write');

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(tenant.id);
    expect(res.body.data.slug).toBe('detail-co');
    expect(res.body.data.role).toBe('write');
  });

  it('404 for unknown tenant slug', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get('/api/tenants/does-not-exist')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('403 when caller is authenticated but not a tenant member', async () => {
    const tenant = await createTenant({ slug: 'closed-co' });
    const { user, password } = await createUser();
    // No membership added.

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('200 read works on a deactivated tenant when caller is a member', async () => {
    const tenant = await createTenant({ slug: 'frozen-co' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');

    await tenantService.setStatus(tenant.id, 'deactivated');

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}`)
      .set('Authorization', `Bearer ${token}`);

    // Read endpoint isn't behind requireActiveTenant — only writes are.
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('frozen-co');
    expect(res.body.data.role).toBe('admin');
  });
});
