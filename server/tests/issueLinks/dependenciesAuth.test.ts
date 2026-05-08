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
 * Issue links — `dependencies` RBAC + lifecycle + cross-workspace.
 * Existing `links.test.ts` covers happy path + Task-only + cycle.
 * This file fills the gaps from #21 slice 4: 401, 403, archived
 * workspace 409, cross-workspace 404, removing a non-existent edge
 * → 404.
 *
 * Routes:
 *   POST   /:key/dependencies                 workspace 'write'
 *   DELETE /:key/dependencies/:blockerKey     workspace 'write'
 */

async function setup() {
  const { user, password } = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  const proj = await createProject({
    workspaceId: ws.id,
    createdByUserId: user.id,
    key: 'DEP',
  });
  const { token } = await loginAs(user.email, password);
  return { user, tenant, ws, proj, token };
}

function depsUrl(opts: {
  tenantSlug: string;
  workspaceSlug: string;
  projectSlug: string;
  key: string;
}): string {
  return `/api/tenants/${opts.tenantSlug}/workspaces/${opts.workspaceSlug}/projects/${opts.projectSlug}/issues/${opts.key}/dependencies`;
}

async function makeTaskPair(workspaceId: string, projectId: string, reporterUserId: string) {
  const blocker = await createIssue({
    workspaceId,
    projectId,
    reporterUserId,
    type: 'T',
  });
  const dep = await createIssue({
    workspaceId,
    projectId,
    reporterUserId,
    type: 'T',
  });
  return { blocker, dep };
}

describe('POST /:key/dependencies — auth + lifecycle gates', () => {
  it('401 when unauthenticated', async () => {
    const { tenant, ws, proj, user } = await setup();
    const { blocker, dep } = await makeTaskPair(ws.id, proj.id, user.id);
    const res = await api()
      .post(
        depsUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: dep.key,
        })
      )
      .send({ blockerKey: blocker.key });
    expect(res.status).toBe(401);
  });

  it('403 when caller has read role only', async () => {
    const { tenant, ws, proj, user } = await setup();
    const { blocker, dep } = await makeTaskPair(ws.id, proj.id, user.id);
    const reader = await createUser();
    await addTenantMember(reader.user.id, tenant.id, 'read');
    await addWorkspaceMember(reader.user.id, ws.id, 'read');
    const { token: readerToken } = await loginAs(reader.user.email, reader.password);
    const res = await api()
      .post(
        depsUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: dep.key,
        })
      )
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ blockerKey: blocker.key });
    expect(res.status).toBe(403);
  });

  it('409 when workspace is archived', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const { blocker, dep } = await makeTaskPair(ws.id, proj.id, user.id);
    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    const res = await api()
      .post(
        depsUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: dep.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ blockerKey: blocker.key });
    expect(res.status).toBe(409);
  });

  it('400 when blocker is not a Task (Bug source)', async () => {
    // Mirrors the existing dep-not-Task case but flips which end isn't
    // a Task — keeps the Task-only invariant tested for both the
    // dependent and the blocker side.
    const { tenant, ws, proj, user, token } = await setup();
    const blocker = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'B',
    });
    const dep = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const res = await api()
      .post(
        depsUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: dep.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ blockerKey: blocker.key });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Task-only/);
  });

  it('404 cross-workspace: blockerKey lives in another workspace', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const dep = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const otherWs = await createWorkspace({ tenantId: tenant.id });
    const otherProj = await createProject({
      workspaceId: otherWs.id,
      createdByUserId: user.id,
      key: 'OTH',
    });
    const otherBlocker = await createIssue({
      workspaceId: otherWs.id,
      projectId: otherProj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const res = await api()
      .post(
        depsUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: dep.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ blockerKey: otherBlocker.key });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /:key/dependencies/:blockerKey — auth + missing-edge', () => {
  it('401 when unauthenticated', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const { blocker, dep } = await makeTaskPair(ws.id, proj.id, user.id);
    await api()
      .post(
        depsUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: dep.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ blockerKey: blocker.key });
    const res = await api().delete(
      `${depsUrl({
        tenantSlug: tenant.slug,
        workspaceSlug: ws.slug,
        projectSlug: proj.slug,
        key: dep.key,
      })}/${blocker.key}`
    );
    expect(res.status).toBe(401);
  });

  it('403 when caller has read role only', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const { blocker, dep } = await makeTaskPair(ws.id, proj.id, user.id);
    await api()
      .post(
        depsUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: dep.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ blockerKey: blocker.key });
    const reader = await createUser();
    await addTenantMember(reader.user.id, tenant.id, 'read');
    await addWorkspaceMember(reader.user.id, ws.id, 'read');
    const { token: readerToken } = await loginAs(reader.user.email, reader.password);
    const res = await api()
      .delete(
        `${depsUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: dep.key,
        })}/${blocker.key}`
      )
      .set('Authorization', `Bearer ${readerToken}`);
    expect(res.status).toBe(403);
  });

  it('404 when edge does not exist', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const { blocker, dep } = await makeTaskPair(ws.id, proj.id, user.id);
    // Never linked them — DELETE should 404.
    const res = await api()
      .delete(
        `${depsUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: dep.key,
        })}/${blocker.key}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('409 when workspace is archived', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const { blocker, dep } = await makeTaskPair(ws.id, proj.id, user.id);
    await api()
      .post(
        depsUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: dep.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ blockerKey: blocker.key });
    await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    const res = await api()
      .delete(
        `${depsUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: dep.key,
        })}/${blocker.key}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});
