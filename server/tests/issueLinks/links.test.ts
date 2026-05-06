import { describe, it, expect } from 'vitest';
import { api } from '../helpers/app.js';
import {
  createUser,
  createTenant,
  addTenantMember,
  createWorkspace,
  createProject,
  createIssue,
  loginAs,
} from '../helpers/factories.js';

/**
 * Issue links — slice 8.
 *   /:key/relates           POST { relatedKey } / DELETE /:relatedKey
 *   /:key/dependencies      POST { blockerKey } / DELETE /:blockerKey
 *
 * relates: symmetric, untyped, every type allowed, idempotent.
 * depends on: directed, Task-only, must stay a DAG.
 */

async function setup() {
  const { user, password } = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  const proj = await createProject({
    workspaceId: ws.id,
    createdByUserId: user.id,
    key: 'LNK',
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

function depsUrl(opts: {
  tenantSlug: string;
  workspaceSlug: string;
  projectSlug: string;
  key: string;
}): string {
  return `/api/tenants/${opts.tenantSlug}/workspaces/${opts.workspaceSlug}/projects/${opts.projectSlug}/issues/${opts.key}/dependencies`;
}

describe('POST /:key/relates', () => {
  it('200 + symmetric — both ends carry the relation', async () => {
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
    const ctx = {
      tenantSlug: tenant.slug,
      workspaceSlug: ws.slug,
      projectSlug: proj.slug,
    };
    const post = await api()
      .post(relatesUrl({ ...ctx, key: a.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ relatedKey: b.key });
    expect(post.status).toBe(200);
    expect(post.body.data.relatedTo).toContain(b.key);

    // Inverse end carries it too.
    const getB = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${b.key}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getB.body.data.relatedTo).toContain(a.key);
  });

  it('200 + idempotent — relating again does not duplicate', async () => {
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
    const ctx = {
      tenantSlug: tenant.slug,
      workspaceSlug: ws.slug,
      projectSlug: proj.slug,
    };
    await api()
      .post(relatesUrl({ ...ctx, key: a.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ relatedKey: b.key });
    const second = await api()
      .post(relatesUrl({ ...ctx, key: a.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ relatedKey: b.key });
    expect(second.status).toBe(200);
    expect(second.body.data.relatedTo.filter((k: string) => k === b.key).length).toBe(1);
  });

  it('400 self-relate', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const a = await createIssue({
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
      .set('Authorization', `Bearer ${token}`)
      .send({ relatedKey: a.key });
    expect(res.status).toBe(400);
  });

  it('404 unknown related key', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const a = await createIssue({
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
      .set('Authorization', `Bearer ${token}`)
      .send({ relatedKey: 'LNK-9999' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /:key/relates/:relatedKey', () => {
  it('200 removes the relation from both ends', async () => {
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
    const ctx = {
      tenantSlug: tenant.slug,
      workspaceSlug: ws.slug,
      projectSlug: proj.slug,
    };
    await api()
      .post(relatesUrl({ ...ctx, key: a.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ relatedKey: b.key });
    const del = await api()
      .delete(`${relatesUrl({ ...ctx, key: a.key })}/${b.key}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body.data.relatedTo).not.toContain(b.key);
  });
});

describe('POST /:key/dependencies', () => {
  it('200 — Task can depend on Task', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const blocker = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
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
    expect(res.status).toBe(200);
    expect(res.body.data.dependsOn).toContain(blocker.key);

    // Blocker carries the inverse.
    const getBlocker = await api()
      .get(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${blocker.key}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(getBlocker.body.data.dependedOnBy).toContain(dep.key);
  });

  it('400 when either end is not a Task', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const blocker = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    // A Bug as the dependent — links are Task-only.
    const dep = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'B',
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

  it('400 when adding the edge would create a cycle', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    // Build A → B → C, then attempt C → A.
    const a = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const b = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const c = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const ctx = {
      tenantSlug: tenant.slug,
      workspaceSlug: ws.slug,
      projectSlug: proj.slug,
    };
    // B depends on A; C depends on B.
    await api()
      .post(depsUrl({ ...ctx, key: b.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ blockerKey: a.key });
    await api()
      .post(depsUrl({ ...ctx, key: c.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ blockerKey: b.key });

    // A depends on C — would close the cycle A → C → B → A.
    const cycle = await api()
      .post(depsUrl({ ...ctx, key: a.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ blockerKey: c.key });
    expect(cycle.status).toBe(400);
    expect(cycle.body.message).toMatch(/cycle/);
  });

  it('400 self-dependency', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const t = await createIssue({
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
          key: t.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ blockerKey: t.key });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /:key/dependencies/:blockerKey', () => {
  it('200 removes the directed edge from both ends', async () => {
    const { tenant, ws, proj, user, token } = await setup();
    const blocker = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const dep = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const ctx = {
      tenantSlug: tenant.slug,
      workspaceSlug: ws.slug,
      projectSlug: proj.slug,
    };
    await api()
      .post(depsUrl({ ...ctx, key: dep.key }))
      .set('Authorization', `Bearer ${token}`)
      .send({ blockerKey: blocker.key });
    const del = await api()
      .delete(`${depsUrl({ ...ctx, key: dep.key })}/${blocker.key}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body.data.dependsOn).not.toContain(blocker.key);

    const getBlocker = await api()
      .get(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues/${blocker.key}`
      )
      .set('Authorization', `Bearer ${token}`);
    expect(getBlocker.body.data.dependedOnBy).not.toContain(dep.key);
  });
});
