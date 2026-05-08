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
 * `PUT /api/tenants/:t/workspaces/:w/projects/:p/workflows/:issueType`
 * — assign a workflow to a (project, issueType) pair. Body
 * `{ workflowSlug }`. Auth: workspace 'write'.
 *
 * Existing coverage in `workflows/workflowCrud.test.ts` exercises
 * happy path + 400 invalid issueType. This file fills the rest of
 * the matrix per #21 slice 4.
 *
 * Archive gates (project + workspace) were added in #45 — assignments
 * against an archived project / workspace return 409.
 */

async function setupAdmin() {
  const { user, password } = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  const proj = await createProject({
    workspaceId: ws.id,
    createdByUserId: user.id,
    key: 'PWF',
  });
  const { token } = await loginAs(user.email, password);
  return { user, tenant, ws, proj, token };
}

function workflowsUrl(tenantSlug: string, workspaceSlug: string): string {
  return `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/workflows`;
}

function projectWorkflowUrl(opts: {
  tenantSlug: string;
  workspaceSlug: string;
  projectSlug: string;
  issueType: string;
}): string {
  return `/api/tenants/${opts.tenantSlug}/workspaces/${opts.workspaceSlug}/projects/${opts.projectSlug}/workflows/${opts.issueType}`;
}

async function seedWorkflow(tenantSlug: string, workspaceSlug: string, token: string, slug: string) {
  const res = await api()
    .post(workflowsUrl(tenantSlug, workspaceSlug))
    .set('Authorization', `Bearer ${token}`)
    .send({
      slug,
      name: slug,
      nodes: [{ statusId: 'backlog', x: 0, y: 0, isInitial: true }],
    });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe('PUT /api/tenants/:t/workspaces/:w/projects/:p/workflows/:issueType', () => {
  it('401 when unauthenticated', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'task-flow');
    const res = await api()
      .put(
        projectWorkflowUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          issueType: 'T',
        })
      )
      .send({ workflowSlug: 'task-flow' });
    expect(res.status).toBe(401);
  });

  it('403 when caller has read role only', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'task-flow');
    const reader = await createUser();
    await addTenantMember(reader.user.id, tenant.id, 'read');
    await addWorkspaceMember(reader.user.id, ws.id, 'read');
    const { token: readerToken } = await loginAs(reader.user.email, reader.password);
    const res = await api()
      .put(
        projectWorkflowUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          issueType: 'T',
        })
      )
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ workflowSlug: 'task-flow' });
    expect(res.status).toBe(403);
  });

  it('200 happy path: PUT writes the assignment, GET reflects it', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'task-flow');
    const put = await api()
      .put(
        projectWorkflowUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          issueType: 'T',
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ workflowSlug: 'task-flow' });
    expect(put.status).toBe(200);
    expect(put.body.data.T.slug).toBe('task-flow');

    const get = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/workflows`)
      .set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.data.T.slug).toBe('task-flow');
  });

  it('200 reassign — second PUT overwrites the first', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'flow-a');
    await seedWorkflow(tenant.slug, ws.slug, token, 'flow-b');
    const url = projectWorkflowUrl({
      tenantSlug: tenant.slug,
      workspaceSlug: ws.slug,
      projectSlug: proj.slug,
      issueType: 'T',
    });
    const first = await api()
      .put(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ workflowSlug: 'flow-a' });
    expect(first.status).toBe(200);
    expect(first.body.data.T.slug).toBe('flow-a');

    const second = await api()
      .put(url)
      .set('Authorization', `Bearer ${token}`)
      .send({ workflowSlug: 'flow-b' });
    expect(second.status).toBe(200);
    expect(second.body.data.T.slug).toBe('flow-b');
  });

  it('400 unknown workflow slug', async () => {
    // Note: spec asks for 404 here, but the usecase
    // (`setProjectWorkflow.ts`) returns 400 with a "not found in this
    // workspace" message. Documenting the actual behaviour rather
    // than the spec; the task says findings should be flagged, not
    // papered over. See test report.
    const { tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .put(
        projectWorkflowUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          issueType: 'T',
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ workflowSlug: 'no-such-flow' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not found/);
  });

  it('400 unknown issueType', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'task-flow');
    const res = await api()
      .put(
        projectWorkflowUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          issueType: 'Z',
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ workflowSlug: 'task-flow' });
    expect(res.status).toBe(400);
  });

  it('404 cross-workspace project: project lives in another workspace', async () => {
    const { user, tenant, ws, token } = await setupAdmin();
    const otherWs = await createWorkspace({ tenantId: tenant.id });
    const otherProj = await createProject({
      workspaceId: otherWs.id,
      createdByUserId: user.id,
      key: 'OTH',
    });
    await seedWorkflow(tenant.slug, ws.slug, token, 'task-flow');
    const res = await api()
      .put(
        projectWorkflowUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          // Use the slug of a project in otherWs against ws's URL.
          projectSlug: otherProj.slug,
          issueType: 'T',
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ workflowSlug: 'task-flow' });
    expect(res.status).toBe(404);
  });

  it('400 missing workflowSlug body', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    const res = await api()
      .put(
        projectWorkflowUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          issueType: 'T',
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('409 when project is archived', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'task-flow');
    const archive = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    expect(archive.status).toBe(200);

    const res = await api()
      .put(
        projectWorkflowUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          issueType: 'T',
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ workflowSlug: 'task-flow' });
    expect(res.status).toBe(409);
  });

  it('409 when workspace is archived', async () => {
    const { tenant, ws, proj, token } = await setupAdmin();
    await seedWorkflow(tenant.slug, ws.slug, token, 'task-flow');
    const archive = await api()
      .post(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/archive`)
      .set('Authorization', `Bearer ${token}`);
    expect(archive.status).toBe(200);

    const res = await api()
      .put(
        projectWorkflowUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          issueType: 'T',
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ workflowSlug: 'task-flow' });
    expect(res.status).toBe(409);
  });
});
