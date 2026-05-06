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
import * as workflowService from '../../src/services/workflowService.js';
import * as projectWorkflowService from '../../src/services/projectWorkflowService.js';
import { db } from '../../src/db/knex.js';
import type { IssueType, StatusId } from '../../src/lib/constants.js';
import type { RuleType } from '../../src/entities/WorkflowTransitionRule.js';

/**
 * The five-rule transition guard runs from updateIssue when status
 * changes. These tests exercise every rule type plus the no-workflow
 * permissive fallback by driving the public PATCH /:key endpoint.
 *
 * Each test wires a small workflow with a single relevant transition
 * (current → next status) and attaches the rule under test.
 */

interface WorkflowSetupOpts {
  workspaceId: string;
  fromStatus: StatusId;
  toStatus: StatusId;
  rules?: Array<{ type: RuleType; params: object | null }>;
}

async function buildWorkflow(opts: WorkflowSetupOpts): Promise<{ workflowId: string }> {
  return db.transaction(async (trx) => {
    const wf = await workflowService.create(
      {
        workspaceId: opts.workspaceId,
        slug: `wf-${Math.random().toString(36).slice(2, 8)}`,
        name: 'Test workflow',
        description: null,
      },
      trx
    );
    const nodes = await workflowService.replaceNodes(
      wf.id,
      [
        { statusId: opts.fromStatus, x: 0, y: 0, isInitial: true, isTerminal: false },
        { statusId: opts.toStatus, x: 100, y: 0, isInitial: false, isTerminal: true },
      ],
      trx
    );
    const transitions = await workflowService.replaceTransitions(
      wf.id,
      [
        {
          fromNodeId: nodes[0].id,
          toNodeId: nodes[1].id,
          rules: opts.rules,
        },
      ],
      trx
    );
    void transitions;
    return { workflowId: wf.id };
  });
}

async function assignWorkflow(
  _workspaceId: string,
  projectId: string,
  issueType: IssueType,
  workflowId: string
): Promise<void> {
  await projectWorkflowService.upsert(projectId, issueType, workflowId);
}

async function setupAdmin() {
  const { user, password } = await createUser();
  const tenant = await createTenant();
  await addTenantMember(user.id, tenant.id, 'admin');
  const ws = await createWorkspace({ tenantId: tenant.id });
  const proj = await createProject({
    workspaceId: ws.id,
    createdByUserId: user.id,
    key: 'GRD',
  });
  const { token } = await loginAs(user.email, password);
  return { user, tenant, ws, proj, token };
}

function patchUrl(opts: {
  tenantSlug: string;
  workspaceSlug: string;
  projectSlug: string;
  key: string;
}): string {
  return `/api/tenants/${opts.tenantSlug}/workspaces/${opts.workspaceSlug}/projects/${opts.projectSlug}/issues/${opts.key}`;
}

describe('workflow transition guard — no-workflow fallback', () => {
  it('200 when no project_workflows row and no slug-default exists (permissive)', async () => {
    const { tenant, ws, proj, user, token } = await setupAdmin();
    const issue = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const res = await api()
      .patch(
        patchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: issue.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'in-progress' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('in-progress');
  });
});

describe('workflow transition guard — graph topology', () => {
  it('403 when no transition exists between fromStatus and toStatus', async () => {
    const { tenant, ws, proj, user, token } = await setupAdmin();
    // Wire a workflow that only allows backlog → todo. We'll try todo → done.
    const { workflowId } = await buildWorkflow({
      workspaceId: ws.id,
      fromStatus: 'backlog',
      toStatus: 'todo',
    });
    await assignWorkflow(ws.id, proj.id, 'T', workflowId);

    // Create the issue at 'todo' so the guard sees a valid fromNode but
    // no transition to 'done'.
    const issue = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
      status: 'todo',
    });
    const res = await api()
      .patch(
        patchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: issue.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'done' });
    expect(res.status).toBe(403);
    // Either "Status 'done' is not a node in this workflow" or
    // "No transition from … to 'done'" — both are valid graph-topology
    // rejections from evaluateTransition.
    expect(res.body.message).toMatch(/transition|not a node/);
  });

  it('200 when a transition is wired with no rules', async () => {
    const { tenant, ws, proj, user, token } = await setupAdmin();
    const { workflowId } = await buildWorkflow({
      workspaceId: ws.id,
      fromStatus: 'backlog',
      toStatus: 'todo',
    });
    await assignWorkflow(ws.id, proj.id, 'T', workflowId);
    const issue = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const res = await api()
      .patch(
        patchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: issue.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'todo' });
    expect(res.status).toBe(200);
  });
});

describe('workflow transition guard — role rule', () => {
  it('403 when caller has write but rule requires admin', async () => {
    const { user: owner, tenant, ws, proj } = await setupAdmin();
    const { workflowId } = await buildWorkflow({
      workspaceId: ws.id,
      fromStatus: 'backlog',
      toStatus: 'todo',
      rules: [{ type: 'role', params: { role: 'admin' } }],
    });
    await assignWorkflow(ws.id, proj.id, 'T', workflowId);
    const issue = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: owner.id,
      type: 'T',
    });
    // Caller is a workspace 'write' (not tenant admin), so role/admin denies.
    const writer = await createUser();
    await addTenantMember(writer.user.id, tenant.id, 'write');
    await addWorkspaceMember(writer.user.id, ws.id, 'write');
    const { token } = await loginAs(writer.user.email, writer.password);

    const res = await api()
      .patch(
        patchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: issue.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'todo' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/role 'admin'/);
  });

  it('200 when caller meets the required role', async () => {
    const { tenant, ws, proj, user, token } = await setupAdmin();
    const { workflowId } = await buildWorkflow({
      workspaceId: ws.id,
      fromStatus: 'backlog',
      toStatus: 'todo',
      rules: [{ type: 'role', params: { role: 'write' } }],
    });
    await assignWorkflow(ws.id, proj.id, 'T', workflowId);
    const issue = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const res = await api()
      .patch(
        patchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: issue.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'todo' });
    expect(res.status).toBe(200);
  });
});

describe('workflow transition guard — assignee_only rule', () => {
  it('403 when caller is not the assignee', async () => {
    const { tenant, ws, proj, user: owner } = await setupAdmin();
    const { workflowId } = await buildWorkflow({
      workspaceId: ws.id,
      fromStatus: 'backlog',
      toStatus: 'todo',
      rules: [{ type: 'assignee_only', params: null }],
    });
    await assignWorkflow(ws.id, proj.id, 'T', workflowId);
    const other = await createUser();
    await addTenantMember(other.user.id, tenant.id, 'write');
    await addWorkspaceMember(other.user.id, ws.id, 'write');
    const issue = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: owner.id,
      assigneeUserId: other.user.id,
      type: 'T',
    });
    // Caller is the owner (admin), but NOT the assignee.
    const { token } = await loginAs(owner.email, 'password123');
    const res = await api()
      .patch(
        patchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: issue.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'todo' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/assignee/);
  });

  it('200 when caller is the assignee', async () => {
    const { tenant, ws, proj, user, token } = await setupAdmin();
    const { workflowId } = await buildWorkflow({
      workspaceId: ws.id,
      fromStatus: 'backlog',
      toStatus: 'todo',
      rules: [{ type: 'assignee_only', params: null }],
    });
    await assignWorkflow(ws.id, proj.id, 'T', workflowId);
    const issue = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      assigneeUserId: user.id,
      type: 'T',
    });
    const res = await api()
      .patch(
        patchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: issue.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'todo' });
    expect(res.status).toBe(200);
  });
});

describe('workflow transition guard — reporter_only and not_self rules', () => {
  it('reporter_only — 403 when caller is not the reporter', async () => {
    const { tenant, ws, proj, user: owner } = await setupAdmin();
    const { workflowId } = await buildWorkflow({
      workspaceId: ws.id,
      fromStatus: 'backlog',
      toStatus: 'todo',
      rules: [{ type: 'reporter_only', params: null }],
    });
    await assignWorkflow(ws.id, proj.id, 'T', workflowId);
    const other = await createUser();
    await addTenantMember(other.user.id, tenant.id, 'write');
    await addWorkspaceMember(other.user.id, ws.id, 'write');
    // Issue reported BY 'other'; we'll act as 'owner'.
    const issue = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: other.user.id,
      type: 'T',
    });
    const { token } = await loginAs(owner.email, 'password123');
    const res = await api()
      .patch(
        patchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: issue.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'todo' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/reporter/);
  });

  it('not_self — 403 when caller IS the reporter', async () => {
    const { tenant, ws, proj, user, token } = await setupAdmin();
    const { workflowId } = await buildWorkflow({
      workspaceId: ws.id,
      fromStatus: 'backlog',
      toStatus: 'todo',
      rules: [{ type: 'not_self', params: null }],
    });
    await assignWorkflow(ws.id, proj.id, 'T', workflowId);
    const issue = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const res = await api()
      .patch(
        patchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: issue.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'todo' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/reporter cannot/);
  });

  it('not_self — 200 when caller is NOT the reporter', async () => {
    const { tenant, ws, proj, user: owner } = await setupAdmin();
    const { workflowId } = await buildWorkflow({
      workspaceId: ws.id,
      fromStatus: 'backlog',
      toStatus: 'todo',
      rules: [{ type: 'not_self', params: null }],
    });
    await assignWorkflow(ws.id, proj.id, 'T', workflowId);
    const other = await createUser();
    await addTenantMember(other.user.id, tenant.id, 'write');
    await addWorkspaceMember(other.user.id, ws.id, 'write');
    const issue = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: other.user.id,
      type: 'T',
    });
    const { token } = await loginAs(owner.email, 'password123');
    const res = await api()
      .patch(
        patchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: issue.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'todo' });
    expect(res.status).toBe(200);
  });
});

describe('workflow transition guard — required_fields rule', () => {
  it('403 when a required field is unset', async () => {
    const { tenant, ws, proj, user, token } = await setupAdmin();
    const { workflowId } = await buildWorkflow({
      workspaceId: ws.id,
      fromStatus: 'backlog',
      toStatus: 'todo',
      rules: [{ type: 'required_fields', params: { fields: ['estimate'] } }],
    });
    await assignWorkflow(ws.id, proj.id, 'T', workflowId);
    // Issue is created without an estimate.
    const issue = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    const res = await api()
      .patch(
        patchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: issue.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'todo' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/estimate/);
  });

  it('200 once the required field is set', async () => {
    const { tenant, ws, proj, user, token } = await setupAdmin();
    const { workflowId } = await buildWorkflow({
      workspaceId: ws.id,
      fromStatus: 'backlog',
      toStatus: 'todo',
      rules: [{ type: 'required_fields', params: { fields: ['estimate'] } }],
    });
    await assignWorkflow(ws.id, proj.id, 'T', workflowId);
    const issue = await createIssue({
      workspaceId: ws.id,
      projectId: proj.id,
      reporterUserId: user.id,
      type: 'T',
    });
    // Set the estimate first, then move status — separate PATCHes so the
    // guard sees the persisted value when the second one runs.
    const setEstimate = await api()
      .patch(
        patchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: issue.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ estimate: 3 });
    expect(setEstimate.status).toBe(200);

    const res = await api()
      .patch(
        patchUrl({
          tenantSlug: tenant.slug,
          workspaceSlug: ws.slug,
          projectSlug: proj.slug,
          key: issue.key,
        })
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'todo' });
    expect(res.status).toBe(200);
  });
});
