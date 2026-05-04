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

interface IssueDTO {
  key: string;
  title: string;
  status: string;
  type: string;
  priority: string;
  assigneeUserId: string | null;
  labels: string[];
  parent: string | null;
  children: string[];
}

async function setup() {
  const { user, password } = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  const proj = await createProject({
    workspaceId: ws.id,
    createdByUserId: user.id,
    slug: 'main',
    key: 'MAIN',
  });
  const { token } = await loginAs(user.email, password);
  return { user, tenant, ws, proj, token };
}

describe('GET /api/tenants/:t/workspaces/:w/projects/:projectSlug/issues', () => {
  it('200 empty when no issues', async () => {
    const { tenant, ws, proj, token } = await setup();
    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('200 returns project issues ordered by seq', async () => {
    const { user, tenant, ws, proj, token } = await setup();
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id });
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id });
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id });
    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((i: IssueDTO) => i.key)).toEqual([
      'MAIN-1',
      'MAIN-2',
      'MAIN-3',
    ]);
  });

  it('cross-project isolation: project A list does not contain project B issues', async () => {
    const { user, tenant, ws, proj, token } = await setup();
    const projB = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      slug: 'other',
      key: 'OTH',
    });
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id });
    await createIssue({ workspaceId: ws.id, projectId: projB.id, reporterUserId: user.id });

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].key).toBe('MAIN-1');
  });

  it('filter: status', async () => {
    const { user, tenant, ws, proj, token } = await setup();
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id, status: 'todo' });
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id, status: 'done' });
    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues?status=done`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('done');
  });

  it('filter: type', async () => {
    const { user, tenant, ws, proj, token } = await setup();
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id, type: 'T' });
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id, type: 'B' });
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id, type: 'B' });
    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues?type=B`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((i: IssueDTO) => i.type === 'B')).toBe(true);
  });

  it('filter: assigneeUserId', async () => {
    const { user, tenant, ws, proj, token } = await setup();
    const a = await createUser();
    await addTenantMember(a.user.id, tenant.id, 'write');
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id, assigneeUserId: a.user.id });
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id });
    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues?assigneeUserId=${a.user.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].assigneeUserId).toBe(a.user.id);
  });

  it('filter: label', async () => {
    const { user, tenant, ws, proj, token } = await setup();
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id, labels: ['frontend'] });
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id, labels: ['backend', 'frontend'] });
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id, labels: ['ops'] });
    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues?label=frontend`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('list returns correct parent/children denormalisation across the page', async () => {
    const { user, tenant, ws, proj, token } = await setup();
    const epic = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'E',
      title: 'Epic',
    });
    const a = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
      parentIssueId: epic.id,
    });
    const b = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'B',
      parentIssueId: epic.id,
    });
    const orphan = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const byKey: Record<string, IssueDTO> = Object.fromEntries(
      res.body.data.map((i: IssueDTO) => [i.key, i])
    );
    expect(byKey[epic.key].parent).toBeNull();
    expect(byKey[epic.key].children).toEqual([a.key, b.key]);
    expect(byKey[a.key].parent).toBe(epic.key);
    expect(byKey[a.key].children).toEqual([]);
    expect(byKey[b.key].parent).toBe(epic.key);
    expect(byKey[orphan.key].parent).toBeNull();
    expect(byKey[orphan.key].children).toEqual([]);
  });

  it('filter: priority', async () => {
    const { user, tenant, ws, proj, token } = await setup();
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id, priority: 'urgent' });
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id, priority: 'low' });
    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/projects/${proj.slug}/issues?priority=urgent`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].priority).toBe('urgent');
  });
});

describe('GET /api/tenants/:t/workspaces/:w/issues (workspace-scoped)', () => {
  it('returns issues across all projects in the workspace', async () => {
    const { user, tenant, ws, proj, token } = await setup();
    const projB = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      slug: 'second',
      key: 'SND',
    });
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id });
    await createIssue({ workspaceId: ws.id, projectId: projB.id, reporterUserId: user.id });

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/issues`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const keys = res.body.data.map((i: IssueDTO) => i.key);
    expect(keys).toContain('MAIN-1');
    expect(keys).toContain('SND-1');
  });

  it('cross-workspace isolation: issues in WS B do not appear in WS A list', async () => {
    const { user, tenant, ws, proj, token } = await setup();
    const wsB = await createWorkspace({ tenantId: tenant.id });
    const projB = await createProject({
      workspaceId: wsB.id,
      createdByUserId: user.id,
      slug: 'b-proj',
      key: 'BBB',
    });
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id });
    await createIssue({ workspaceId: wsB.id, projectId: projB.id, reporterUserId: user.id });

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/issues`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].key).toBe('MAIN-1');
  });

  it('filter: projectId narrows the workspace list to one project', async () => {
    const { user, tenant, ws, proj, token } = await setup();
    const projB = await createProject({
      workspaceId: ws.id,
      createdByUserId: user.id,
      slug: 'narrow',
      key: 'NRW',
    });
    await createIssue({ workspaceId: ws.id, projectId: proj.id, reporterUserId: user.id });
    await createIssue({ workspaceId: ws.id, projectId: projB.id, reporterUserId: user.id });

    const res = await api()
      .get(`/api/tenants/${tenant.slug}/workspaces/${ws.slug}/issues?projectId=${projB.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].key).toBe('NRW-1');
  });
});
