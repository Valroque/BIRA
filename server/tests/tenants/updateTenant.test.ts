import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import { addTenantMember, createTenant, createUser, loginAs } from '../helpers/factories.js';
import * as tenantService from '../../src/services/tenantService.js';

describe('PATCH /api/tenants/:tenantSlug', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant({ slug: 'edit-co' });
    const res = await api()
      .patch(`/api/tenants/${tenant.slug}`)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(401);
  });

  it('200 admin can rename the tenant; new name is returned and persisted', async () => {
    const tenant = await createTenant({ slug: 'rename-co', name: 'Old Name' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('New Name');
    expect(res.body.data.slug).toBe('rename-co');

    // Re-read via service to confirm persistence.
    const reloaded = await tenantService.findBySlug('rename-co');
    expect(reloaded?.name).toBe('New Name');
  });

  it('200 admin can update letter/color/bg', async () => {
    const tenant = await createTenant({ slug: 'brand-co' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ letter: 'B', color: '#10b981', bg: '#d1fae5' });

    expect(res.status).toBe(200);
    expect(res.body.data.letter).toBe('B');
    expect(res.body.data.color).toBe('#10b981');
    expect(res.body.data.bg).toBe('#d1fae5');
  });

  it('403 when caller has only write role', async () => {
    const tenant = await createTenant({ slug: 'write-co' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nope' });

    expect(res.status).toBe(403);
  });

  it('403 when caller has only read role', async () => {
    const tenant = await createTenant({ slug: 'read-co' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'read');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nope' });

    expect(res.status).toBe(403);
  });

  it('403 when caller is not a tenant member', async () => {
    const tenant = await createTenant({ slug: 'closed-co' });
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nope' });

    expect(res.status).toBe(403);
  });

  it('404 for unknown tenant slug', async () => {
    const { user, password } = await createUser();
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch('/api/tenants/does-not-exist')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nope' });

    expect(res.status).toBe(404);
  });

  it('400 when body has no fields', async () => {
    const tenant = await createTenant({ slug: 'empty-patch-co' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('400 when name is empty string', async () => {
    const tenant = await createTenant({ slug: 'blank-name-co' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' });

    expect(res.status).toBe(400);
  });

  it('rejects slug changes silently (slug remains the same)', async () => {
    const tenant = await createTenant({ slug: 'immut-co', name: 'Immut' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed', slug: 'should-be-ignored' });

    // Schema strips unknown keys; slug is unchanged.
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('immut-co');
    expect(res.body.data.name).toBe('Renamed');
  });

  it('409 when tenant is deactivated', async () => {
    const tenant = await createTenant({ slug: 'frozen-co' });
    const { user, password } = await createUser();
    await addTenantMember(user.id, tenant.id, 'admin');
    await tenantService.setStatus(tenant.id, 'deactivated');

    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed' });

    expect(res.status).toBe(409);
  });
});
