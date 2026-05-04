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

// Centralised coverage of the requireActiveTenant middleware at the route
// level. Other suites touch this incidentally via deactivate/reactivate
// flows; this one focuses on the gate itself — message wording, full
// round-trip behaviour, and the read-vs-write asymmetry.
describe('requireActiveTenant gate behaviour', () => {
  it('409 on POST workspaces under a deactivated tenant, even for admin', async () => {
    const tenant = await createTenant({ slug: 'frozen-write' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');

    const { token } = await loginAs(user.email, password);

    await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send(validWorkspaceBody);

    expect(res.status).toBe(409);
  });

  it('409 error message includes the tenant slug and the reactivate hint', async () => {
    const tenant = await createTenant({ slug: 'helpful-msg' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');

    const { token } = await loginAs(user.email, password);

    await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send(validWorkspaceBody);

    expect(res.status).toBe(409);
    // Wording from requireActiveTenant in tenantScope.ts: "Tenant '<slug>'
    // is deactivated — reactivate it before making changes".
    const message = res.body.message ?? res.body.error ?? '';
    expect(message).toContain('helpful-msg');
    expect(message).toContain('deactivated');
    expect(message).toContain('reactivate');
  });

  it('201 on the same POST after reactivation', async () => {
    const tenant = await createTenant({ slug: 'thawed-co' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');

    const { token } = await loginAs(user.email, password);

    await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    const blocked = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send(validWorkspaceBody);
    expect(blocked.status).toBe(409);

    await api()
      .post(`/api/tenants/${tenant.slug}/reactivate`)
      .set('Authorization', `Bearer ${token}`);

    const ok = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send(validWorkspaceBody);
    expect(ok.status).toBe(201);
  });

  it('200 on tenant detail (read) under a deactivated tenant — only writes are blocked', async () => {
    const tenant = await createTenant({ slug: 'read-after-freeze' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');

    const { token } = await loginAs(user.email, password);

    await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('read-after-freeze');
  });
});
