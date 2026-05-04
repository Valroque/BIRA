import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  loginAs,
} from '../helpers/factories.js';

const VALID_BODY = {
  slug: 'test-ws',
  name: 'Test Workspace',
  letter: 'T',
  color: '#4f46e5',
  bg: '#e0e7ff',
};

describe('POST /api/tenants/:tenantSlug/workspaces', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  it('403 when caller is write (not admin)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(403);
  });

  it('403 when caller is read', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'read');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(403);
  });

  it('201 happy path as tenant admin', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('test-ws');
    expect(res.body.data.name).toBe('Test Workspace');
    expect(res.body.data.status).toBe('active');
  });

  it('400 on invalid slug (uppercase)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_BODY, slug: 'Bad-Slug' });
    expect(res.status).toBe(400);
  });

  it('400 on invalid slug (leading dash)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_BODY, slug: '-bad' });
    expect(res.status).toBe(400);
  });

  it('400 on missing name', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const { token } = await loginAs(user.email, password);

    const { name: _n, ...withoutName } = VALID_BODY;
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send(withoutName);
    expect(res.status).toBe(400);
  });

  it('409 when same slug already exists in tenant', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const { token } = await loginAs(user.email, password);

    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(409);
  });

  it('201 same slug in two DIFFERENT tenants is allowed (unique per tenant)', async () => {
    const { user, password } = await createUser();
    const t1 = await createTenant();
    const t2 = await createTenant();
    await addTenantMember(user.id, t1.id, 'admin');
    await addTenantMember(user.id, t2.id, 'admin');
    const { token } = await loginAs(user.email, password);

    const r1 = await api()
      .post(`/api/tenants/${t1.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    const r2 = await api()
      .post(`/api/tenants/${t2.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
  });

  it('409 when tenant is deactivated (requireActiveTenant)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const { token } = await loginAs(user.email, password);

    // deactivate the tenant first
    await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(409);
  });
});
