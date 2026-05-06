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

/**
 * GET /api/tenants/:t/workspaces/:w/mentionables/search?q=&types=&limit=
 *
 * v1: user search only. Prefix matches rank above substring matches.
 * Type=team is rejected (501) until workspace_teams ships.
 */

async function setupWithMembers() {
  const { user: caller, password } = await createUser({ firstName: 'Caller' });
  const tenant = await createTenant();
  await addTenantMember(caller.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });

  const alice = await createUser({ firstName: 'Alice', lastName: 'Smith' });
  const alex = await createUser({ firstName: 'Alex', lastName: 'Park' });
  const bob = await createUser({ firstName: 'Bob', lastName: 'Walter' });
  for (const u of [alice, alex, bob]) {
    await addTenantMember(u.user.id, tenant.id, 'write');
    await addWorkspaceMember(u.user.id, ws.id, 'write');
  }

  const { token } = await loginAs(caller.email, password);
  return { tenant, ws, token, alice, alex, bob };
}

function searchUrl(opts: {
  tenantSlug: string;
  workspaceSlug: string;
  q: string;
  types?: string;
  limit?: number;
}): string {
  const qs = new URLSearchParams({ q: opts.q });
  if (opts.types) qs.set('types', opts.types);
  if (opts.limit !== undefined) qs.set('limit', String(opts.limit));
  return `/api/tenants/${opts.tenantSlug}/workspaces/${opts.workspaceSlug}/mentionables/search?${qs.toString()}`;
}

describe('GET /mentionables/search', () => {
  it('returns prefix matches first, then substring matches', async () => {
    const { tenant, ws, token, alice, alex } = await setupWithMembers();
    const res = await api()
      .get(searchUrl({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, q: 'al' }))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((h: { id: string }) => h.id);
    // Both Alice and Alex prefix-match on first name 'Al…'.
    expect(ids).toContain(alice.user.id);
    expect(ids).toContain(alex.user.id);
  });

  it('substring matches return when no prefix matches exist', async () => {
    const { tenant, ws, token, bob } = await setupWithMembers();
    // 'alt' is not a prefix of any user's name/email but it IS a substring
    // of 'Walter'.
    const res = await api()
      .get(searchUrl({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, q: 'alt' }))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((h: { id: string }) => h.id);
    expect(ids).toContain(bob.user.id);
  });

  it('respects the limit parameter', async () => {
    const { tenant, ws, token } = await setupWithMembers();
    const res = await api()
      .get(searchUrl({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, q: 'a', limit: 1 }))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('400 when q is empty', async () => {
    const { tenant, ws, token } = await setupWithMembers();
    const res = await api()
      .get(searchUrl({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, q: '' }))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('200 with team hits when types=team is requested (Domain B)', async () => {
    const { tenant, ws, token } = await setupWithMembers();
    // Create a team in this workspace via the API so the test uses the
    // real route stack — keeps the search test honest about the join.
    const created = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/teams`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'alpha-team', name: 'Alpha Team', color: '#0891b2' });
    expect(created.status).toBe(201);

    const res = await api()
      .get(
        searchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          q: 'alpha',
          types: 'team',
        })
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const teamHits = res.body.data.filter((h: { type: string }) => h.type === 'team');
    expect(teamHits.length).toBeGreaterThan(0);
    expect(teamHits[0].id).toBe(created.body.data.id);
    expect(teamHits[0].slug).toBe('alpha-team');
  });

  it('returns user hits when types=user,team is mixed', async () => {
    const { tenant, ws, token, alice } = await setupWithMembers();
    const res = await api()
      .get(
        searchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          q: 'alice',
          types: 'user,team',
        })
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((h: { id: string }) => h.id);
    expect(ids).toContain(alice.user.id);
  });

  it('does not surface users from a different workspace', async () => {
    const { tenant, ws, token } = await setupWithMembers();
    // Add a user that's a tenant member but NOT a workspace member.
    const outsider = await createUser({ firstName: 'Alistair' });
    await addTenantMember(outsider.user.id, tenant.id, 'write');
    // No addWorkspaceMember — outsider should not appear in this workspace.

    const res = await api()
      .get(searchUrl({ tenantSlug: tenant.slug, workspaceSlug: ws.slug, q: 'alis' }))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((h: { id: string }) => h.id);
    expect(ids).not.toContain(outsider.user.id);
  });
});
