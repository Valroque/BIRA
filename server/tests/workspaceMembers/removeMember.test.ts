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

async function membershipIdFor(userId: string, workspaceId: string): Promise<string> {
  const row = (await db('workspace_memberships')
    .where({ userId, workspaceId })
    .first()) as { id: string } | undefined;
  if (!row) throw new Error('membership not found in test fixture');
  return row.id;
}

describe('DELETE /api/tenants/:t/workspaces/:w/members/:membershipId', () => {
  it('204 admin removes another member', async () => {
    const { user: admin, password: adminPwd } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(admin.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    await addWorkspaceMember(target.user.id, ws.id, 'write');
    const targetMembershipId = await membershipIdFor(target.user.id, ws.id);
    const { token } = await loginAs(admin.email, adminPwd);

    const res = await api()
      .delete(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members/${targetMembershipId}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    const after = await db('workspace_memberships').where('id', targetMembershipId).first();
    expect(after).toBeUndefined();
  });

  it('204 self-leave: a write member can delete their own membership', async () => {
    const { user: admin } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(admin.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(admin.id, ws.id, 'admin');

    const me = await createUser();
    await addTenantMember(me.user.id, tenant.id, 'write');
    await addWorkspaceMember(me.user.id, ws.id, 'write');
    const myMembershipId = await membershipIdFor(me.user.id, ws.id);
    const { token } = await loginAs(me.user.email, me.password);

    const res = await api()
      .delete(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members/${myMembershipId}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('403 when a non-admin tries to remove someone else', async () => {
    const tenant = await createTenant();
    const writer = await createUser();
    const target = await createUser();
    await addTenantMember(writer.user.id, tenant.id, 'write');
    await addTenantMember(target.user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(writer.user.id, ws.id, 'write');
    await addWorkspaceMember(target.user.id, ws.id, 'write');
    const targetMembershipId = await membershipIdFor(target.user.id, ws.id);
    const { token } = await loginAs(writer.user.email, writer.password);

    const res = await api()
      .delete(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members/${targetMembershipId}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('409 last-admin guard: removing the only effective admin is refused', async () => {
    const { user: admin, password } = await createUser();
    const tenant = await createTenant();
    // Tenant admin role: write only — so admin's effective workspace
    // admin status comes solely from the explicit workspace row.
    await addTenantMember(admin.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(admin.id, ws.id, 'admin');
    const adminMembershipId = await membershipIdFor(admin.id, ws.id);
    const { token } = await loginAs(admin.email, password);

    const res = await api()
      .delete(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members/${adminMembershipId}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it('204 cascades: removing a workspace member also clears their team memberships', async () => {
    // Domain B + A interaction: when a workspace admin removes a user,
    // the `team_memberships` rows for that user in this workspace's
    // teams must be cleared in the same transaction.
    const { user: admin, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(admin.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    await addWorkspaceMember(target.user.id, ws.id, 'write');
    const targetMembershipId = await membershipIdFor(target.user.id, ws.id);
    const { token } = await loginAs(admin.email, password);

    // Create a team and add the target.
    const teamRes = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/teams`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'design', name: 'Design', color: '#4f46e5' });
    expect(teamRes.status).toBe(201);
    const addedTo = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/teams/design/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.user.id });
    expect(addedTo.status).toBe(201);

    // Remove the workspace member.
    const remove = await api()
      .delete(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members/${targetMembershipId}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(remove.status).toBe(204);

    // Team should now have 0 members.
    const teamAfter = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/teams/design`)
      .set('Authorization', `Bearer ${token}`);
    expect(teamAfter.status).toBe(200);
    expect(teamAfter.body.data.memberCount).toBe(0);
  });

  it('204 last-admin guard satisfied: tenant admin covers, removal allowed', async () => {
    // Workspace has explicit admin A. Tenant admin B (no workspace row)
    // covers as implicit admin → A can self-leave.
    const tenant = await createTenant();
    const a = await createUser();
    const b = await createUser();
    await addTenantMember(a.user.id, tenant.id, 'write');
    await addTenantMember(b.user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(a.user.id, ws.id, 'admin');
    const aMembershipId = await membershipIdFor(a.user.id, ws.id);
    const { token } = await loginAs(a.user.email, a.password);

    const res = await api()
      .delete(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members/${aMembershipId}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});
