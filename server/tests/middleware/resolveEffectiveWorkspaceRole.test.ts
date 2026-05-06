import { describe, it, expect } from 'vitest';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  createProject,
} from '../helpers/factories.js';
import { resolveEffectiveWorkspaceRole } from '../../src/services/membershipService.js';
import { db } from '../../src/db/knex.js';

/**
 * Branch coverage for `resolveEffectiveWorkspaceRole` (Domain C.4):
 *   1. tenant admin → 'admin'
 *   2. explicit workspace membership → that role
 *   3. project_user_access → implicit 'read'
 *   4. team_memberships × project_team_access → implicit 'read'
 *   5. none of the above → null
 */
describe('resolveEffectiveWorkspaceRole', () => {
  it('returns null for non-tenant-member', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const stranger = await createUser();
    const role = await resolveEffectiveWorkspaceRole(stranger.user.id, ws.id, tenant.id);
    expect(role).toBeNull();
  });

  it('returns admin for tenant admins (branch 1)', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const admin = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    const role = await resolveEffectiveWorkspaceRole(admin.user.id, ws.id, tenant.id);
    expect(role).toBe('admin');
  });

  it('returns the explicit workspace role (branch 2)', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const u = await createUser();
    await addTenantMember(u.user.id, tenant.id, 'write');
    await db('workspace_memberships').insert({
      userId: u.user.id,
      workspaceId: ws.id,
      role: 'write',
      status: 'active',
    });
    const role = await resolveEffectiveWorkspaceRole(u.user.id, ws.id, tenant.id);
    expect(role).toBe('write');
  });

  it('returns null for a tenant member with no workspace or project access', async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const u = await createUser();
    await addTenantMember(u.user.id, tenant.id, 'write');
    const role = await resolveEffectiveWorkspaceRole(u.user.id, ws.id, tenant.id);
    expect(role).toBeNull();
  });

  it("returns 'read' for users with only project_user_access (branch 3)", async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const owner = await createUser();
    await addTenantMember(owner.user.id, tenant.id, 'admin');
    const project = await createProject({ workspaceId: ws.id, createdByUserId: owner.user.id });
    const u = await createUser();
    await addTenantMember(u.user.id, tenant.id, 'write');
    await db('project_user_access').insert({
      projectId: project.id,
      userId: u.user.id,
      role: 'write',
    });
    const role = await resolveEffectiveWorkspaceRole(u.user.id, ws.id, tenant.id);
    expect(role).toBe('read');
  });

  it("returns 'read' via team_memberships × project_team_access (branch 4)", async () => {
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const owner = await createUser();
    await addTenantMember(owner.user.id, tenant.id, 'admin');
    const project = await createProject({ workspaceId: ws.id, createdByUserId: owner.user.id });
    const u = await createUser();
    await addTenantMember(u.user.id, tenant.id, 'write');

    // Create a team; add the user to the team (without making them a workspace
    // member); grant the team access to the project.
    const [team] = (await db('teams')
      .insert({
        workspaceId: ws.id,
        slug: 'engineering',
        name: 'Engineering',
        color: '#4f46e5',
        createdByUserId: owner.user.id,
      })
      .returning(['id'])) as { id: string }[];
    await db('team_memberships').insert({ teamId: team.id, userId: u.user.id });
    await db('project_team_access').insert({
      projectId: project.id,
      teamId: team.id,
      role: 'read',
    });

    const role = await resolveEffectiveWorkspaceRole(u.user.id, ws.id, tenant.id);
    expect(role).toBe('read');
  });

  it('GET workspace returns 200 for project-only user (integration smoke)', async () => {
    // Smoke: the new branch lets a project-only user reach
    // resolveWorkspaceScope without 403.
    const { api } = await import('../helpers/app.js');
    const { loginAs } = await import('../helpers/factories.js');
    const tenant = await createTenant();
    const ws = await createWorkspace({ tenantId: tenant.id });
    const owner = await createUser();
    await addTenantMember(owner.user.id, tenant.id, 'admin');
    const project = await createProject({
      workspaceId: ws.id,
      createdByUserId: owner.user.id,
    });
    const u = await createUser();
    await addTenantMember(u.user.id, tenant.id, 'write');
    await db('project_user_access').insert({
      projectId: project.id,
      userId: u.user.id,
      role: 'read',
    });
    const { token } = await loginAs(u.user.email, u.password);

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
