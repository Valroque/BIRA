import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  addWorkspaceMember,
  createProject,
  createIssue,
  loginAs,
} from '../helpers/factories.js';

/**
 * Issue links — `relates` RBAC + lifecycle + cross-workspace coverage.
 * The existing `links.test.ts` covers symmetric storage + idempotency +
 * 400/404 on bad payloads. This file fills the gaps from #21 slice 4:
 * 401, 403, archived workspace 409, cross-workspace 404, removing a
 * non-existent edge → 404.
 *
 * Routes:
 *   POST   /:key/relates                    workspace 'write'
 *   DELETE /:key/relates/:relatedKey        workspace 'write'
 */

async function setup() {
  const { user, password } = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  const proj = await createProject({
    workspaceId: ws.id,
    createdByUserId: user.id,
    key: 'REL',
  });
  const { token } = await loginAs(user.email, password);
  return { user, tenant, ws, proj, token };
}

function relatesUrl(opts: {
  tenantSlug: string;
  workspaceSlug: string;
  projectSlug: string;
  key: string;
}): string {
  return `/api/tenants/${opts.tenantSlug}/workspaces/${opts.workspaceSlug}/projects/${opts.projectSlug}/issues/${opts.key}/relates`;
}

describe('POST /:key/relates — auth + lifecycle gates', () => {
  it('401 when unauthenticated', async () => {
    const { tenant, ws, proj, user } = await setup();
    const a = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    const b = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    const res = await api()
      .post(
        relatesUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: a.key,
        })
      )
      .send({ relatedKey: b.key });
    expect(res.status).toBe(401);
  });

  it('403 when caller has read role only', async () => {
    const { tenant, ws, proj, user } = await setup();
    const a = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    const b = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    const reader = await createUser();
    await addTenantMember(reader.user.id, tenant.id, 'read');
    await addWorkspaceMember(reader.user.id, ws.id, 'read');
    const { token: readerToken } = await loginAs(reader.user.email, reader.password);
    const res = await api()
      .post(
        relatesUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: a.key,
        })
      )
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ relatedKey: b.key });
    expect(res.status).toBe(403);
  });

  it('409 when workspace is archived', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const a = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    const b = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    const res = await api()
      .post(
        relatesUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: a.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ relatedKey: b.key });
    expect(res.status).toBe(409);
  });

  it('404 cross-workspace: relatedKey lives in another workspace', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const a = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    // Build a sibling workspace + project + issue under the same tenant.
    const otherWs = await createWorkspace({ tenantId: tenant.id });
    const otherProj = await createProject({
      workspaceId: otherWs.id,
      createdByUserId: user.id,
      key: 'OTH',
    });
    const otherIssue = await createIssue({
      workspaceId: otherWs.id,
      projectId: otherProj.id,
      reporterUserId: user.id,
    });
    const res = await api()
      .post(
        relatesUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: a.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ relatedKey: otherIssue.key });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /:key/relates/:relatedKey — auth + missing-edge', () => {
  it('401 when unauthenticated', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const a = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    const b = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    // Establish the edge first so we know the unauth call isn't 404.
    await api()
      .post(
        relatesUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: a.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ relatedKey: b.key });
    const res = await api().delete(
      `${relatesUrl({
        tenantSlug: tenant.slug,
        workspaceSlug: ws.slug,
        projectSlug: proj.slug,
        key: a.key,
      })}/${b.key}`
    );
    expect(res.status).toBe(401);
  });

  it('403 when caller has read role only', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const a = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    const b = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    await api()
      .post(
        relatesUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: a.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ relatedKey: b.key });
    const reader = await createUser();
    await addTenantMember(reader.user.id, tenant.id, 'read');
    await addWorkspaceMember(reader.user.id, ws.id, 'read');
    const { token: readerToken } = await loginAs(reader.user.email, reader.password);
    const res = await api()
      .delete(
        `${relatesUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: a.key,
        })}/${b.key}`
      )
      .set('Authorization', `Bearer ${readerToken}`);
    expect(res.status).toBe(403);
  });

  it('404 when edge does not exist', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const a = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    const b = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    // Never created the relation — DELETE should 404.
    const res = await api()
      .delete(
        `${relatesUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: a.key,
        })}/${b.key}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('409 when workspace is archived', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const a = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    const b = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
    });
    // Establish the edge while still active.
    await api()
      .post(
        relatesUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: a.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ relatedKey: b.key });
    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    const res = await api()
      .delete(
        `${relatesUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: a.key,
        })}/${b.key}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});
