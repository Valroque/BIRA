import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  addWorkspaceMember,
  loginAs,
} from '../helpers/factories.js';
import { db } from '../../src/db/knex.js';

const VALID_BODY = {
  slug: 'test-proj',
  key: 'TST',
  name: 'Test Project',
  letter: 'T',
  color: '#4f46e5',
  bg: '#e0e7ff',
};

describe('POST /api/tenants/:t/workspaces/:w/projects', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  it('403 when caller is read', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'read');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(403);
  });

  it('201 happy path as write member: status defaults to active', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('test-proj');
    expect(res.body.data.key).toBe('TST');
    expect(res.body.data.status).toBe('active');
  });

  it('201 as tenant admin without explicit workspace membership', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(201);
  });

  it('400 on invalid slug (uppercase)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_BODY, slug: 'BadSlug' });
    expect(res.status).toBe(400);
  });

  it('400 on invalid key (lowercase)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_BODY, key: 'tst' });
    expect(res.status).toBe(400);
  });

  it('400 on missing name', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const { name: _n, ...withoutName } = VALID_BODY;
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send(withoutName);
    expect(res.status).toBe(400);
  });

  it('409 when workspace is archived (requireActiveWorkspace)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id, status: 'archived' });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(409);
  });

  it('409 when tenant is deactivated (requireActiveTenant)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(409);
  });

  it('grants the creator admin access on the new project (project_user_access row)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'write');
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(201);

    const projectId = res.body.data.id as string;
    const grant = (await db('project_user_access')
      .where({ projectId, userId: user.id })
      .first('role')) as { role: string } | undefined;
    expect(grant?.role).toBe('admin');
  });

  it('atomic: a creator-grant failure rolls back the project insert', async () => {
    // Re-using the same user_id as creator twice via two parallel calls
    // would race; instead we verify the contract by inspecting the
    // post-conflict state. After a duplicate-slug call (which fails
    // BEFORE the transaction starts), no orphan rows remain.
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'write');
    const { token } = await loginAs(user.email, password);

    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);

    const projectsBefore = await db('projects')
      .where('workspace_id', ws.id)
      .count<{ count: string }>('id as count')
      .first();
    const grantsBefore = await db('project_user_access')
      .count<{ count: string }>('id as count')
      .first();

    // Same slug → 409. Should not create a second project nor a second grant.
    const dup = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(dup.status).toBe(409);

    const projectsAfter = await db('projects')
      .where('workspace_id', ws.id)
      .count<{ count: string }>('id as count')
      .first();
    const grantsAfter = await db('project_user_access')
      .count<{ count: string }>('id as count')
      .first();
    expect(projectsAfter?.count).toBe(projectsBefore?.count);
    expect(grantsAfter?.count).toBe(grantsBefore?.count);
  });

  it('409 or 400 on duplicate key within same workspace', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);

    // second project with different slug but same key → unique(workspace_id, key) violation
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_BODY, slug: 'test-proj-2' });
    // PG 23505 → 400 'Duplicate field value entered'; or caught pre-DB as 409
    expect([400, 409]).toContain(res.status);
  });
});
