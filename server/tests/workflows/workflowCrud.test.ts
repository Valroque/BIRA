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

/**
 * Workflow CRUD + project ↔ workflow assignment.
 * Endpoints:
 *   GET    /api/tenants/:t/workspaces/:w/workflows
 *   POST   /api/tenants/:t/workspaces/:w/workflows
 *   GET    /api/tenants/:t/workspaces/:w/workflows/:slug
 *   PATCH  /api/tenants/:t/workspaces/:w/workflows/:slug
 *   DELETE /api/tenants/:t/workspaces/:w/workflows/:slug
 *   GET    /api/tenants/:t/workspaces/:w/projects/:p/workflows
 *   PUT    /api/tenants/:t/workspaces/:w/projects/:p/workflows/:issueType
 */

async function setupAdmin() {
  const { user, password } = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  const proj = await createProject({
    workspaceId: ws.id,
    createdByUserId: user.id,
    key: 'WF',
  });
  const { token } = await loginAs(user.email, password);
  return { user, tenant, ws, proj, token };
}

function workflowsUrl(tenantSlug: string, workspaceSlug: string): string {
  return `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/workflows`;
}

describe('POST /workflows', () => {
  it('201 with nodes only', async () => {
    const { tenant, ws, token } = await setupAdmin();
    const res = await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'simple',
        name: 'Simple',
        nodes: [
          { statusId: 'backlog', x: 0, y: 0, isInitial: true },
          { statusId: 'done', x: 100, y: 0, isTerminal: true },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('simple');
    expect(res.body.data.nodes).toHaveLength(2);
    expect(res.body.data.transitions).toEqual([]);
  });

  it('409 on slug collision in the same workspace', async () => {
    const { tenant, ws, token } = await setupAdmin();
    const body = {
      slug: 'dup',
      name: 'Dup',
      nodes: [{ statusId: 'backlog', x: 0, y: 0, isInitial: true }],
    };
    const first = await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(first.status).toBe(201);

    const second = await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(second.status).toBe(409);
  });

  it('403 for write-but-not-workspace-write caller', async () => {
    const { tenant, ws } = await setupAdmin();
    const reader = await createUser();
    await addTenantMember(reader.user.id, tenant.id, 'read');
    await addWorkspaceMember(reader.user.id, ws.id, 'read');
    const { token } = await loginAs(reader.user.email, reader.password);
    const res = await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'nope',
        name: 'Nope',
        nodes: [{ statusId: 'backlog', x: 0, y: 0, isInitial: true }],
      });
    expect(res.status).toBe(403);
  });
});

describe('GET / + GET /:slug + DELETE /:slug', () => {
  it('list returns the created workflows; GET /:slug returns one; DELETE 204', async () => {
    const { tenant, ws, token } = await setupAdmin();
    await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'a',
        name: 'A',
        nodes: [{ statusId: 'backlog', x: 0, y: 0, isInitial: true }],
      });
    await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'b',
        name: 'B',
        nodes: [{ statusId: 'todo', x: 0, y: 0, isInitial: true }],
      });

    const list = await api()
      .get(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((w: { slug: string }) => w.slug).sort()).toEqual(['a', 'b']);

    const one = await api()
      .get(`${workflowsUrl(tenant.slug, ws.slug)}/a`)
      .set('Authorization', `Bearer ${token}`);
    expect(one.status).toBe(200);
    expect(one.body.data.slug).toBe('a');

    const del = await api()
      .delete(`${workflowsUrl(tenant.slug, ws.slug)}/a`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const after = await api()
      .get(`${workflowsUrl(tenant.slug, ws.slug)}/a`)
      .set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(404);
  });

  it('DELETE requires admin', async () => {
    const { tenant, ws, token } = await setupAdmin();
    await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'a',
        name: 'A',
        nodes: [{ statusId: 'backlog', x: 0, y: 0, isInitial: true }],
      });
    const writer = await createUser();
    await addTenantMember(writer.user.id, tenant.id, 'write');
    await addWorkspaceMember(writer.user.id, ws.id, 'write');
    const { token: writerToken } = await loginAs(writer.user.email, writer.password);
    const del = await api()
      .delete(`${workflowsUrl(tenant.slug, ws.slug)}/a`)
      .set('Authorization', `Bearer ${writerToken}`);
    expect(del.status).toBe(403);
  });
});

describe('PATCH /workflows/:slug — full-replace nodes/transitions', () => {
  it('200 replacing nodes and adding transitions in one go', async () => {
    const { tenant, ws, token } = await setupAdmin();
    // Create with nodes only, then PATCH to add transitions referencing the
    // freshly-created node ids returned in the create response.
    const created = await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'p',
        name: 'P',
        nodes: [
          { statusId: 'backlog', x: 0, y: 0, isInitial: true },
          { statusId: 'todo', x: 100, y: 0 },
        ],
      });
    expect(created.status).toBe(201);
    const [n0, n1] = created.body.data.nodes as Array<{ id: string }>;

    const patched = await api()
      .patch(`${workflowsUrl(tenant.slug, ws.slug)}/p`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        transitions: [{ fromNodeId: n0.id, toNodeId: n1.id, label: 'start' }],
      });
    expect(patched.status).toBe(200);
    expect(patched.body.data.transitions).toHaveLength(1);
    expect(patched.body.data.transitions[0].label).toBe('start');
  });

  it('400 on empty patch', async () => {
    const { tenant, ws, token } = await setupAdmin();
    await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'p',
        name: 'P',
        nodes: [{ statusId: 'backlog', x: 0, y: 0, isInitial: true }],
      });
    const res = await api()
      .patch(`${workflowsUrl(tenant.slug, ws.slug)}/p`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('PATCH preserves client-supplied node ids', async () => {
    const { tenant, ws, token } = await setupAdmin();
    const created = await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'preserve',
        name: 'Preserve',
        nodes: [
          { statusId: 'backlog', x: 0, y: 0, isInitial: true },
          { statusId: 'todo', x: 100, y: 0 },
        ],
      });
    expect(created.status).toBe(201);
    const original = created.body.data.nodes as Array<{ id: string; statusId: string }>;
    const patched = await api()
      .patch(`${workflowsUrl(tenant.slug, ws.slug)}/preserve`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        nodes: original.map((n) => ({
          id: n.id,
          statusId: n.statusId,
          x: 10,
          y: 10,
        })),
      });
    expect(patched.status).toBe(200);
    const patchedNodes = patched.body.data.nodes as Array<{ id: string; statusId: string }>;
    expect(patchedNodes.map((n) => n.id).sort()).toEqual(original.map((n) => n.id).sort());
  });

  it('PATCH mints UUIDs for nodes without ids', async () => {
    const { tenant, ws, token } = await setupAdmin();
    const created = await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'mix',
        name: 'Mix',
        nodes: [{ statusId: 'backlog', x: 0, y: 0, isInitial: true }],
      });
    expect(created.status).toBe(201);
    const [existing] = created.body.data.nodes as Array<{ id: string }>;
    const patched = await api()
      .patch(`${workflowsUrl(tenant.slug, ws.slug)}/mix`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        nodes: [
          { id: existing.id, statusId: 'backlog', x: 0, y: 0, isInitial: true },
          { statusId: 'todo', x: 100, y: 0 },
        ],
      });
    expect(patched.status).toBe(200);
    const out = patched.body.data.nodes as Array<{ id: string; statusId: string }>;
    expect(out).toHaveLength(2);
    const preserved = out.find((n) => n.statusId === 'backlog');
    const minted = out.find((n) => n.statusId === 'todo');
    expect(preserved?.id).toBe(existing.id);
    expect(minted?.id).toBeDefined();
    expect(minted?.id).not.toBe(existing.id);
    // uuid v4-ish shape sanity check; the precise version isn't load-bearing,
    // but the id should look like a uuid rather than e.g. an integer string.
    expect(minted?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('PATCH rejects duplicate supplied ids', async () => {
    const { tenant, ws, token } = await setupAdmin();
    await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'dupids',
        name: 'DupIds',
        nodes: [{ statusId: 'backlog', x: 0, y: 0, isInitial: true }],
      });
    // Same explicit uuid on both nodes — should 400 before reaching insert.
    const sharedId = '11111111-1111-4111-8111-111111111111';
    const res = await api()
      .patch(`${workflowsUrl(tenant.slug, ws.slug)}/dupids`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        nodes: [
          { id: sharedId, statusId: 'backlog', x: 0, y: 0, isInitial: true },
          { id: sharedId, statusId: 'todo', x: 100, y: 0 },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('PATCH rejects invalid uuid for id field', async () => {
    const { tenant, ws, token } = await setupAdmin();
    await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'baduuid',
        name: 'BadUUID',
        nodes: [{ statusId: 'backlog', x: 0, y: 0, isInitial: true }],
      });
    const res = await api()
      .patch(`${workflowsUrl(tenant.slug, ws.slug)}/baduuid`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        nodes: [{ id: 'not-a-uuid', statusId: 'backlog', x: 0, y: 0, isInitial: true }],
      });
    expect(res.status).toBe(400);
  });

  it('PATCH with transitions referencing preserved node id succeeds', async () => {
    // The load-bearing scenario: FE sends nodes (with their existing ids)
    // and transitions in one PATCH. The preserved ids let the transition
    // validator find the from/to nodes in the post-replace id set.
    const { tenant, ws, token } = await setupAdmin();
    const created = await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'atomic',
        name: 'Atomic',
        nodes: [
          { statusId: 'backlog', x: 0, y: 0, isInitial: true },
          { statusId: 'todo', x: 100, y: 0 },
        ],
      });
    expect(created.status).toBe(201);
    const [n0, n1] = created.body.data.nodes as Array<{ id: string; statusId: string }>;
    const patched = await api()
      .patch(`${workflowsUrl(tenant.slug, ws.slug)}/atomic`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        nodes: [
          { id: n0.id, statusId: n0.statusId, x: 0, y: 0, isInitial: true },
          { id: n1.id, statusId: n1.statusId, x: 100, y: 0 },
        ],
        transitions: [{ fromNodeId: n0.id, toNodeId: n1.id, label: 'go' }],
      });
    expect(patched.status).toBe(200);
    expect(patched.body.data.transitions).toHaveLength(1);
    expect(patched.body.data.transitions[0].label).toBe('go');
    expect(patched.body.data.transitions[0].fromNodeId).toBe(n0.id);
    expect(patched.body.data.transitions[0].toNodeId).toBe(n1.id);
    // Node ids preserved end-to-end.
    const outNodes = patched.body.data.nodes as Array<{ id: string }>;
    expect(outNodes.map((n) => n.id).sort()).toEqual([n0.id, n1.id].sort());
  });

  it('PATCH with transitions referencing a not-supplied id 400s', async () => {
    // Stale FE id case: client holds a uuid that isn't in the new node
    // set (and wasn't supplied on this PATCH). validateTransitions runs
    // against the post-replace node id set and rejects.
    const { tenant, ws, token } = await setupAdmin();
    const created = await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'stale',
        name: 'Stale',
        nodes: [
          { statusId: 'backlog', x: 0, y: 0, isInitial: true },
          { statusId: 'todo', x: 100, y: 0 },
        ],
      });
    expect(created.status).toBe(201);
    const [n0] = created.body.data.nodes as Array<{ id: string; statusId: string }>;
    const ghostId = '22222222-2222-4222-8222-222222222222';
    const res = await api()
      .patch(`${workflowsUrl(tenant.slug, ws.slug)}/stale`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        nodes: [
          { id: n0.id, statusId: 'backlog', x: 0, y: 0, isInitial: true },
          { statusId: 'todo', x: 100, y: 0 },
        ],
        transitions: [{ fromNodeId: n0.id, toNodeId: ghostId, label: 'nope' }],
      });
    expect(res.status).toBe(400);
  });
});

describe('Project ↔ workflow assignment', () => {
  function projectWfUrl(opts: {
    tenantSlug: string;
    workspaceSlug: string;
    projectSlug: string;
  }): string {
    return `/api/tenants/${opts.tenantSlug}/workspaces/${opts.workspaceSlug}/projects/${opts.projectSlug}/workflows`;
  }

  it('PUT writes the assignment, GET returns the map', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    await api()
      .post(workflowsUrl(tenant.slug, ws.slug))
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'task-flow',
        name: 'Task flow',
        nodes: [{ statusId: 'backlog', x: 0, y: 0, isInitial: true }],
      });
    const ctx = {
      tenantSlug: tenant.slug,
      workspaceSlug: ws.slug,
      projectSlug: proj.slug,
    };
    const put = await api()
      .put(`${projectWfUrl(ctx)}/T`)
      .set('Authorization', `Bearer ${token}`)
      .send({ workflowSlug: 'task-flow' });
    expect(put.status).toBe(200);
    expect(put.body.data.T.slug).toBe('task-flow');

    const get = await api()
      .get(projectWfUrl(ctx))
      .set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.data.T.slug).toBe('task-flow');
  });

  it('PUT 400 on invalid issue type', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .put(
        `/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/workflows/Z`
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ workflowSlug: 'whatever' });
    expect(res.status).toBe(400);
  });
});
