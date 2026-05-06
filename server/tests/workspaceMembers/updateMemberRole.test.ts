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

describe('PATCH /api/tenants/:t/workspaces/:w/members/:membershipId', () => {
  it('403 when caller is workspace write (not admin)', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'write');
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    await addWorkspaceMember(target.user.id, ws.id, 'write');
    const targetMembershipId = await membershipIdFor(target.user.id, ws.id);
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members/${targetMembershipId}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('200 happy path: promotes write to admin', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    await addWorkspaceMember(target.user.id, ws.id, 'write');
    const targetMembershipId = await membershipIdFor(target.user.id, ws.id);
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members/${targetMembershipId}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
  });

  it('409 last-admin guard: cannot demote the only effective admin', async () => {
    // Two users: a workspace-only admin (no tenant admin role) and a
    // workspace write. Demoting the lone admin would leave zero effective
    // admins → reject.
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'write');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(user.id, ws.id, 'admin');
    const writer = await createUser();
    await addTenantMember(writer.user.id, tenant.id, 'write');
    await addWorkspaceMember(writer.user.id, ws.id, 'write');
    const adminMembershipId = await membershipIdFor(user.id, ws.id);
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members/${adminMembershipId}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'write' });
    expect(res.status).toBe(409);
  });

  it('200 demotion allowed when a tenant admin covers as implicit workspace admin', async () => {
    // Workspace admin user A; tenant admin B is not an explicit workspace
    // member but counts as implicit admin. Demoting A is fine.
    const tenant = await createTenant();
    const a = await createUser();
    const b = await createUser();
    await addTenantMember(a.user.id, tenant.id, 'write');
    await addTenantMember(b.user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(a.user.id, ws.id, 'admin');
    const { token } = await loginAs(b.user.email, b.password);
    const aMembershipId = await membershipIdFor(a.user.id, ws.id);

    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/members/${aMembershipId}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'write' });
    expect(res.status).toBe(200);
  });

  it('404 when membership belongs to a different workspace', async () => {
    const { user, password } = await createUser();
    const tenant = await createTenant();
    await addTenantMember(user.id, tenant.id, 'admin');
    const ws1 = await createWorkspace({ tenantId: tenant.id });
    const ws2 = await createWorkspace({ tenantId: tenant.id });
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'write');
    await addWorkspaceMember(target.user.id, ws2.id, 'write');
    const ws2MembershipId = await membershipIdFor(target.user.id, ws2.id);
    const { token } = await loginAs(user.email, password);

    const res = await api()
      .patch(
        `/api/tenants/${tenant.slug}/workspaces/${ws1.slug}/members/${ws2MembershipId}`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(404);
  });
});
