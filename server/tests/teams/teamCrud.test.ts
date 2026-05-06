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

interface SetupResult {
  tenantSlug: string;
  wsSlug: string;
  adminToken: string;
  adminId: string;
  writerToken: string;
  writerId: string;
}

async function setupWorkspace(): Promise<SetupResult> {
  const { user: admin, password: adminPwd } = await createUser();
  const writer = await createUser();
  const tenant = await createTenant();
  await addTenantMember(admin.id, tenant.id, 'admin');
  await addTenantMember(writer.user.id, tenant.id, 'write');
  const ws = await createWorkspace({ tenantId: tenant.id });
  await addWorkspaceMember(writer.user.id, ws.id, 'write');
  const { token: adminToken } = await loginAs(admin.email, adminPwd);
  const { token: writerToken } = await loginAs(writer.user.email, writer.password);
  return {
    tenantSlug: tenant.slug,
    wsSlug: ws.slug,
    adminToken,
    adminId: admin.id,
    writerToken,
    writerId: writer.user.id,
  };
}

describe('Teams CRUD', () => {
  it('GET teams returns empty list initially', async () => {
    const s = await setupWorkspace();
    const res = await api()
      .get(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams`)
      .set('Authorization', `Bearer ${s.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('POST teams 401 unauthenticated', async () => {
    const s = await setupWorkspace();
    const res = await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams`)
      .send({ slug: 'design', name: 'Design', color: '#4f46e5' });
    expect(res.status).toBe(401);
  });

  it('POST teams 403 when caller is workspace write', async () => {
    const s = await setupWorkspace();
    const res = await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams`)
      .set('Authorization', `Bearer ${s.writerToken}`)
      .send({ slug: 'design', name: 'Design', color: '#4f46e5' });
    expect(res.status).toBe(403);
  });

  it('POST teams 201 happy path', async () => {
    const s = await setupWorkspace();
    const res = await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ slug: 'design', name: 'Design', color: '#4f46e5' });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('design');
    expect(res.body.data.name).toBe('Design');
    expect(res.body.data.memberCount).toBe(0);
    expect(res.body.data.createdByUserId).toBe(s.adminId);
  });

  it('POST teams 409 on duplicate slug within the same workspace', async () => {
    const s = await setupWorkspace();
    await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ slug: 'design', name: 'Design', color: '#4f46e5' });
    const dup = await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ slug: 'design', name: 'Different Name', color: '#0891b2' });
    expect(dup.status).toBe(409);
  });

  it('GET / PATCH / DELETE happy paths', async () => {
    const s = await setupWorkspace();
    await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ slug: 'design', name: 'Design', color: '#4f46e5' });

    const get = await api()
      .get(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams/design`)
      .set('Authorization', `Bearer ${s.adminToken}`);
    expect(get.status).toBe(200);
    expect(get.body.data.name).toBe('Design');

    const patch = await api()
      .patch(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams/design`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ name: 'Design Team' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.name).toBe('Design Team');

    const del = await api()
      .delete(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams/design`)
      .set('Authorization', `Bearer ${s.adminToken}`);
    expect(del.status).toBe(204);

    const after = await api()
      .get(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams/design`)
      .set('Authorization', `Bearer ${s.adminToken}`);
    expect(after.status).toBe(404);
  });
});

describe('Team membership', () => {
  it('POST member: 400 when target is not a workspace member', async () => {
    const s = await setupWorkspace();
    const stranger = await createUser();
    // tenant member only — NOT a workspace member.
    await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ slug: 'design', name: 'Design', color: '#4f46e5' });

    const res = await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams/design/members`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ userId: stranger.user.id });
    expect(res.status).toBe(400);
  });

  it('POST member: 201 when target is an active workspace member', async () => {
    const s = await setupWorkspace();
    await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ slug: 'design', name: 'Design', color: '#4f46e5' });

    const res = await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams/design/members`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ userId: s.writerId });
    expect(res.status).toBe(201);
    expect(res.body.data.memberCount).toBe(1);
    expect(res.body.data.members[0].userId).toBe(s.writerId);
  });

  it('POST member: 409 when already a team member', async () => {
    const s = await setupWorkspace();
    await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ slug: 'design', name: 'Design', color: '#4f46e5' });
    await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams/design/members`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ userId: s.writerId });

    const dup = await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams/design/members`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ userId: s.writerId });
    expect(dup.status).toBe(409);
  });

  it('DELETE member happy path', async () => {
    const s = await setupWorkspace();
    await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ slug: 'design', name: 'Design', color: '#4f46e5' });
    await api()
      .post(`/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams/design/members`)
      .set('Authorization', `Bearer ${s.adminToken}`)
      .send({ userId: s.writerId });

    const del = await api()
      .delete(
        `/api/tenants/${s.tenantSlug}/workspaces/${s.wsSlug}/teams/design/members/${s.writerId}`
      )
      .set('Authorization', `Bearer ${s.adminToken}`);
    expect(del.status).toBe(200);
    expect(del.body.data.memberCount).toBe(0);
  });
});
