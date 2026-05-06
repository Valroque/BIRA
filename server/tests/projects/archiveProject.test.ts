import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  addWorkspaceMember,
  createProject,
  loginAs,
} from '../helpers/factories.js';

describe('POST /api/tenants/:t/workspaces/:w/projects/:projectSlug/archive', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { user } = await createUser();
    const project = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const res = await api().post(
      `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}/archive`
    );
    expect(res.status).toBe(401);
  });

  it('403 when caller is workspace write (not admin)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'write');
    const project = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('200 happy path as workspace admin: status flips to archived', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'admin');
    const project = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('archived');
  });

  it('404 on default GET after archive (stale bookmark fails fast)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const project = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const { token } = await loginAs(user.email, password);

    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);

    const getRes = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(404);

    const getInclude = await api()
      .get(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}?includeArchived=true`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(getInclude.status).toBe(200);
    expect(getInclude.body.data.status).toBe('archived');
  });

  it('archived projects are filtered from list by default', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const active = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const archived = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      status: 'archived',
    });
    const { token } = await loginAs(user.email, password);

    const def = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`);
    expect(def.status).toBe(200);
    const slugs = def.body.data.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain(active.slug);
    expect(slugs).not.toContain(archived.slug);

    const inc = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects?includeArchived=true`)
      .set('Authorization', `Bearer ${token}`);
    expect(inc.status).toBe(200);
    const allSlugs = inc.body.data.map((p: { slug: string }) => p.slug);
    expect(allSlugs).toContain(active.slug);
    expect(allSlugs).toContain(archived.slug);
  });

  it('200 idempotent: archiving an already-archived project', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const project = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      status: 'archived',
    });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('archived');
  });

  it('409 when tenant is deactivated', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const project = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const { token } = await loginAs(user.email, password);

    await api()
      .post(`/api/tenants/${tenant.slug}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it('issue creation is blocked on archived project (409)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const project = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      status: 'archived',
    });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}/issues`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'T', title: 'Should fail' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/tenants/:t/workspaces/:w/projects/:projectSlug/unarchive', () => {
  it('200 happy path: archive then unarchive flips status back to active', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const project = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      status: 'archived',
    });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}/unarchive`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');

    // Issue creation works again after unarchive
    const create = await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}/issues`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'T', title: 'Now ok' });
    expect(create.status).toBe(201);
  });

  it('200 idempotent: unarchiving an already-active project', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const project = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .post(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}/unarchive`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });
});
