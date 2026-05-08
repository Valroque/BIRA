import { describe, expect, it } from 'vitest';
import { api } from '../helpers/app.js';
import {
  addTenantMember,
  addWorkspaceMember,
  createTenant,
  createUser,
  createWorkspace,
  loginAs,
} from '../helpers/factories.js';
import { db } from '../../src/db/knex.js';
import { findWorkspacesLeftAdminless } from '../../src/services/membershipService.js';
import { setUserActive } from '../../src/usecases/users/setUserActive.js';

describe('POST /api/tenants/:tenantSlug/members/:userId/deactivate', () => {
  it('401 when unauthenticated', async () => {
    const tenant = await createTenant();
    const target = await createUser();
    const res = await api().post(
      `/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`
    );
    expect(res.status).toBe(401);
  });

  it('403 when caller is tenant write (not admin)', async () => {
    const tenant = await createTenant();
    const writer = await createUser();
    const target = await createUser();
    await addTenantMember(writer.user.id, tenant.id, 'write');
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(writer.user.email, writer.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('400 when admin targets themselves', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${admin.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('404 when target user is not a member of this tenant', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const stranger = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${stranger.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('404 when target is a member of a different tenant only', async () => {
    const tenantA = await createTenant({ slug: 'tenant-da-a' });
    const tenantB = await createTenant({ slug: 'tenant-da-b' });
    const admin = await createUser();
    const inOther = await createUser();
    await addTenantMember(admin.user.id, tenantA.id, 'admin');
    await addTenantMember(inOther.user.id, tenantB.id, 'write');
    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenantA.slug}/members/${inOther.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('200 happy path: flips isActive to false; subsequent login fails', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const target = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    // Login refuses (returns 401 invalid credentials, not 403, to avoid
    // leaking account-state info — matches the existing login usecase).
    const loginRes = await api()
      .post('/api/auth/login')
      .send({ email: target.user.email, password: target.password });
    expect(loginRes.status).toBe(401);
  });

  it('existing access tokens are rejected after deactivation', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const target = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    await addTenantMember(target.user.id, tenant.id, 'write');
    const adminAuth = await loginAs(admin.user.email, admin.password);
    const targetAuth = await loginAs(target.user.email, target.password);

    // Token works before deactivation
    const before = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${targetAuth.token}`);
    expect(before.status).toBe(200);

    await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`)
      .set('Authorization', `Bearer ${adminAuth.token}`);

    const after = await api()
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${targetAuth.token}`);
    expect(after.status).toBe(401);
  });

  it('200 idempotent: deactivating an already-deactivated user', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const target = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(admin.user.email, admin.password);

    await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    const second = await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.data.isActive).toBe(false);
  });

  // ── Workspace last-admin invariant (issue #20) ────────────────────────
  //
  // Under v1 "implicit OK" semantics — tenant admins resolve to admin in
  // every workspace — the deactivation guard is unreachable through the
  // API: the route requires the actor to be a tenant admin, so at least
  // one tenant admin always remains after deactivating someone else, and
  // every workspace stays covered. The first test below documents that
  // expected pass-through. The remaining two exercise the guard at the
  // service / usecase level, where direct DB writes (or a hypothetical
  // future system-admin path) could construct the otherwise-unreachable
  // adminless state.

  it('200 deactivation succeeds when target is sole explicit workspace admin (tenant admin covers implicitly)', async () => {
    // Two tenant admins (actor + a bystander) so the tenant-admin floor
    // is intact. Target is the only explicit `workspace_memberships`
    // admin in W; deactivation should still succeed because the bystander
    // tenant admin (and the actor) cover W implicitly.
    const tenant = await createTenant();
    const actor = await createUser();
    const bystander = await createUser();
    const target = await createUser();
    await addTenantMember(actor.user.id, tenant.id, 'admin');
    await addTenantMember(bystander.user.id, tenant.id, 'admin');
    await addTenantMember(target.user.id, tenant.id, 'write');

    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(target.user.id, ws.id, 'admin');

    const { token } = await loginAs(actor.user.email, actor.password);
    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('findWorkspacesLeftAdminless returns the workspace when target is the only effective admin', async () => {
    // Construct a state the API can't reach: NO other tenant admins,
    // and target is the only explicit admin of one workspace. The
    // helper must flag the workspace.
    const tenant = await createTenant();
    const target = await createUser();
    // No other tenant admins exist — the actor in a real call would be
    // a tenant admin, but we exercise the helper directly here.
    await addTenantMember(target.user.id, tenant.id, 'admin');
    const wsCovered = await createWorkspace({ tenantId: tenant.id });
    const wsStranded = await createWorkspace({ tenantId: tenant.id });

    // wsCovered has a second explicit admin who isn't the target.
    const otherAdmin = await createUser();
    await addTenantMember(otherAdmin.user.id, tenant.id, 'write');
    await addWorkspaceMember(otherAdmin.user.id, wsCovered.id, 'admin');
    // wsStranded has no other admins — only the target is effective.
    await addWorkspaceMember(target.user.id, wsStranded.id, 'admin');

    const stranded = await findWorkspacesLeftAdminless(target.user.id, tenant.id);
    expect(stranded.map((w) => w.slug)).toEqual([wsStranded.slug]);
  });

  it('setUserActive throws 409 when deactivation would strand a workspace (defense-in-depth)', async () => {
    // Same construction as above; this time invoke setUserActive
    // directly (bypassing the route's tenant-admin gate) to confirm
    // the guard is wired in. The 409 message lists the offending
    // workspace slug.
    const tenant = await createTenant();
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(target.user.id, ws.id, 'admin');

    // A second user used purely as the actingUserId — the self-target
    // check requires actor !== target. The actor doesn't need any
    // membership at this layer (the route would have rejected, but we
    // bypass it deliberately).
    const actor = await createUser();

    await expect(
      setUserActive({
        actingUserId: actor.user.id,
        tenantId: tenant.id,
        targetUserId: target.user.id,
        isActive: false,
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining(ws.slug),
    });

    // And the user's is_active flag was NOT flipped.
    const row = (await db('users')
      .where('id', target.user.id)
      .first('is_active as isActive')) as { isActive: boolean } | undefined;
    expect(row?.isActive).toBe(true);
  });

  it('reactivation never triggers the workspace last-admin guard', async () => {
    // Even in the "would-strand-on-deactivate" state, reactivation
    // (isActive=true) must succeed — the guard only applies to
    // deactivation. Set up the same stranded state but call setUserActive
    // with isActive=true after first manually flipping the user
    // inactive. The guard short-circuits on `!input.isActive`.
    const tenant = await createTenant();
    const target = await createUser();
    await addTenantMember(target.user.id, tenant.id, 'admin');
    const ws = await createWorkspace({ tenantId: tenant.id });
    await addWorkspaceMember(target.user.id, ws.id, 'admin');
    // Flip is_active to false directly so the reactivation has work to do.
    await db('users').where('id', target.user.id).update({ is_active: false });

    const actor = await createUser();
    const result = await setUserActive({
      actingUserId: actor.user.id,
      tenantId: tenant.id,
      targetUserId: target.user.id,
      isActive: true,
    });
    expect(result.isActive).toBe(true);
  });
});

describe('POST /api/tenants/:tenantSlug/members/:userId/reactivate', () => {
  it('200 happy path: deactivate then reactivate restores login', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const target = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(admin.user.email, admin.password);

    await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/reactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);

    const loginRes = await api()
      .post('/api/auth/login')
      .send({ email: target.user.email, password: target.password });
    expect(loginRes.status).toBe(200);
  });

  it('200 idempotent: reactivating an already-active user', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const target = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    await addTenantMember(target.user.id, tenant.id, 'write');
    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${target.user.id}/reactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
  });

  it('400 when admin reactivates themselves', async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    await addTenantMember(admin.user.id, tenant.id, 'admin');
    const { token } = await loginAs(admin.user.email, admin.password);

    const res = await api()
      .post(`/api/tenants/${tenant.slug}/members/${admin.user.id}/reactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
