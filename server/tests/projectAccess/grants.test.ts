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
import { db } from '../../src/db/knex.js';

interface Setup {
  tenantSlug: string;
  wsSlug: string;
  projectSlug: string;
  projectId: string;
  workspaceId: string;
  tenantId: string;
  adminToken: string;
  adminId: string;
  writerId: string;
  writerToken: string;
}

async function setup(): Promise<Setup> {
  const { user: admin, password: adminPwd } = await createUser();
  const writer = await createUser();
  const tenant = await createTenant();
  await addTenantMember(admin.id, tenant.id, 'admin');
  await addTenantMember(writer.user.id, tenant.id, 'write');
  const ws = await createWorkspace({ tenantId: tenant.id });
  await addWorkspaceMember(writer.user.id, ws.id, 'write');
  const project = await createProject({ workspaceId: ws.id, createdByUserId: admin.id });
  const { token: adminToken } = await loginAs(admin.email, adminPwd);
  const { token: writerToken } = await loginAs(writer.user.email, writer.password);
  return {
    tenantSlug: tenant.slug,
    wsSlug: ws.slug,
    projectSlug: project.slug,
    projectId: project.id,
    workspaceId: ws.id,
    tenantId: tenant.id,
    adminToken,
    adminId: admin.id,
    writerId: writer.user.id,
    writerToken,
  };
}

describe('Project access — list', () => {
  it('GET access returns empty teams + users initially', async () => {
    const s = await setup();
    const res = await api()
      .get(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access`
      )
      .set('Authorization', `Bearer ${s.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.teams).toEqual([]);
    expect(res.body.data.users).toEqual([]);
  });
});

describe('Project access — team grants', () => {
  async function createTeamFor(s: Setup): Promise<string> {
    const res = await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ slug: 'design', name: 'Design', color: '#4f46e5' });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  it('400 when zod role enum receives admin (route check)', async () => {
    const s = await setup();
    const teamId = await createTeamFor(s);
    const res = await api()
      .post(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/teams`
      )
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ teamId, role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('CHECK constraint blocks admin even if route is bypassed', async () => {
    const s = await setup();
    const teamId = await createTeamFor(s);
    let dbError: unknown = null;
    try {
      await db('project_team_access').insert({
        projectId: s.projectId,
        teamId,
        role: 'admin',
      });
    } catch (e) {
      dbError = e;
    }
    expect(dbError).not.toBeNull();
    expect(String(dbError)).toMatch(/project_team_access_role_chk|check constraint/i);
  });

  it('201 happy path: add team grant returns access view with team hydrated', async () => {
    const s = await setup();
    const teamId = await createTeamFor(s);
    const res = await api()
      .post(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/teams`
      )
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ teamId, role: 'write' });
    expect(res.status).toBe(201);
    expect(res.body.data.teams.length).toBe(1);
    expect(res.body.data.teams[0].team.slug).toBe('design');
    expect(res.body.data.teams[0].role).toBe('write');
  });

  it('PATCH role and DELETE happy paths', async () => {
    const s = await setup();
    const teamId = await createTeamFor(s);
    await api()
      .post(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/teams`
      )
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ teamId, role: 'write' });

    const patch = await api()
      .patch(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/teams/${teamId}`
      )
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ role: 'read' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.teams[0].role).toBe('read');

    const del = await api()
      .delete(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/teams/${teamId}`
      )
      .set('Authorization', `Bearer ${s.adminToken}`);
    expect(del.status).toBe(200);
    expect(del.body.data.teams).toEqual([]);
  });
});

describe('Project access — user grants', () => {
  it('400 when target is not an active workspace member', async () => {
    const s = await setup();
    const stranger = await createUser();
    const res = await api()
      .post(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/users`
      )
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ userId: stranger.user.id, role: 'write' });
    expect(res.status).toBe(400);
  });

  it('201 happy path with admin role allowed for explicit user grants', async () => {
    const s = await setup();
    const res = await api()
      .post(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/users`
      )
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ userId: s.writerId, role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.users.length).toBe(1);
    expect(res.body.data.users[0].role).toBe('admin');
  });

  it('PATCH role and DELETE happy paths', async () => {
    const s = await setup();
    await api()
      .post(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/users`
      )
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ userId: s.writerId, role: 'write' });

    const patch = await api()
      .patch(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/users/${s.writerId}`
      )
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ role: 'read' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.users[0].role).toBe('read');

    const del = await api()
      .delete(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/users/${s.writerId}`
      )
      .set('Authorization', `Bearer ${s.adminToken}`);
    expect(del.status).toBe(200);
    expect(del.body.data.users).toEqual([]);
  });
});

describe('Project access — effective members (4 provenance branches)', () => {
  it('explicit-user wins over team and admin coverage', async () => {
    const s = await setup();
    // Tenant admin (s.adminId) — implicit project admin via tenant-admin source.
    // Add an explicit-user grant of `read` for adminId; explicit-user precedence
    // beats tenant-admin in the resolver.
    await api()
      .post(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/users`
      )
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ userId: s.adminId, role: 'read' });

    const res = await api()
      .get(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/effective-members`
      )
      .set('Authorization', `Bearer ${s.adminToken}`);
    expect(res.status).toBe(200);
    const adminEntry = res.body.data.find(
      (m: { userId: string }) => m.userId === s.adminId
    );
    expect(adminEntry.provenance).toBe('explicit-user');
    expect(adminEntry.role).toBe('read');
  });

  it('tenant-admin provenance for tenant admin without explicit grant', async () => {
    const s = await setup();
    const res = await api()
      .get(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/effective-members`
      )
      .set('Authorization', `Bearer ${s.adminToken}`);
    expect(res.status).toBe(200);
    const adminEntry = res.body.data.find(
      (m: { userId: string }) => m.userId === s.adminId
    );
    expect(adminEntry.provenance).toBe('tenant-admin');
    expect(adminEntry.role).toBe('admin');
  });

  it('workspace-admin provenance for explicit workspace admins', async () => {
    const s = await setup();
    // Promote writer to workspace admin (no tenant-admin coverage — they're
    // tenant 'write'). Then they should show up as workspace-admin.
    const wmRow = (await db('workspace_memberships')
      .where({ userId: s.writerId, workspaceId: s.workspaceId })
      .first()) as { id: string };
    await db('workspace_memberships').where('id', wmRow.id).update({ role: 'admin' });

    const res = await api()
      .get(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/effective-members`
      )
      .set('Authorization', `Bearer ${s.adminToken}`);
    expect(res.status).toBe(200);
    const writerEntry = res.body.data.find(
      (m: { userId: string }) => m.userId === s.writerId
    );
    expect(writerEntry.provenance).toBe('workspace-admin');
    expect(writerEntry.role).toBe('admin');
  });

  it('team provenance for users derived from team-access only', async () => {
    const s = await setup();
    // Create a team, add the writer to it, then grant the team `read`
    // access on the project. Writer is a workspace 'write' member but
    // has no explicit project-user grant — provenance should be 'team'.
    const teamRes = await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ slug: 'design', name: 'Design', color: '#4f46e5' });
    expect(teamRes.status).toBe(201);
    const teamId = teamRes.body.data.id;

    await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams/design/members`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ userId: s.writerId });

    await api()
      .post(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/teams`
      )
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ teamId, role: 'read' });

    const res = await api()
      .get(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/projects/${s.projectSlug}/access/effective-members`
      )
      .set('Authorization', `Bearer ${s.adminToken}`);
    expect(res.status).toBe(200);
    const writerEntry = res.body.data.find(
      (m: { userId: string }) => m.userId === s.writerId
    );
    expect(writerEntry.provenance).toBe('team');
    expect(writerEntry.role).toBe('read');
    expect(writerEntry.viaTeams.length).toBe(1);
    expect(writerEntry.viaTeams[0].slug).toBe('design');
  });
});
