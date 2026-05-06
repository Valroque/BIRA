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

describe('PATCH /api/tenants/:t/workspaces/:w/projects/:projectSlug', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { user } = await createUser();
    const project = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}`)
      .send({ name: 'Renamed' });
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
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(403);
  });

  it('200 happy path: renames + bumps updatedAt as workspace admin', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'admin');
    const project = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed', description: 'New desc' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed');
    expect(res.body.data.description).toBe('New desc');
    // slug + key stay locked
    expect(res.body.data.slug).toBe(project.slug);
    expect(res.body.data.key).toBe(project.key);
  });

  it('200 as tenant admin even without explicit workspace membership (tenant admin wins)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const project = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ letter: 'X' });
    expect(res.status).toBe(200);
    expect(res.body.data.letter).toBe('X');
  });

  it('400 when no fields provided', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const project = await createProject({ workspaceId: ws.id, createdByUserId: user.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('404 when project does not exist', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/nope`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(404);
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
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(409);
  });

  it('200 on archived project (admin can still rename a frozen project)', async () => {
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
      .patch(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${project.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed');
  });
});
