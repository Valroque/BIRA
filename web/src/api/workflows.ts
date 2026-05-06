// Workflow API client.
//
// BE endpoints (verified in server/src/routes/workflows.ts and projects.ts):
//   GET    /api/tenants/:t/workspaces/:w/workflows
//   GET    /api/tenants/:t/workspaces/:w/workflows/:slug
//   GET    /api/tenants/:t/workspaces/:w/projects/:projectSlug/workflows
//   PUT    /api/tenants/:t/workspaces/:w/projects/:projectSlug/workflows/:issueType
//
// The PUT endpoint takes `{ workflowSlug }` (not workflowId) — slugs are
// the URL/API identity even though `id` is the DB primary key.

import { apiFetch } from './client';
import {
  adaptWorkflow, adaptProjectWorkflowMap,
  type RawWorkflow, type RawProjectWorkflowMap,
  type Workflow, type ProjectWorkflowMap,
} from './adapters/workflow.adapter';
import type { IssueTypeLetter } from '../fixtures';

export async function listWorkflows(
  tenantSlug: string,
  workspaceSlug: string,
): Promise<Workflow[]> {
  const items = await apiFetch<RawWorkflow[]>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/workflows`,
  );
  return items.map(adaptWorkflow);
}

export async function getWorkflow(
  tenantSlug: string,
  workspaceSlug: string,
  workflowSlug: string,
): Promise<Workflow> {
  const raw = await apiFetch<RawWorkflow>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/workflows/${workflowSlug}`,
  );
  return adaptWorkflow(raw);
}

export async function getProjectWorkflows(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
): Promise<ProjectWorkflowMap> {
  const raw = await apiFetch<RawProjectWorkflowMap>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/workflows`,
  );
  return adaptProjectWorkflowMap(raw);
}

export async function setProjectWorkflow(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  issueType: IssueTypeLetter,
  workflowSlug: string,
): Promise<ProjectWorkflowMap> {
  const raw = await apiFetch<RawProjectWorkflowMap>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/workflows/${issueType}`,
    { method: 'PUT', body: JSON.stringify({ workflowSlug }) },
  );
  return adaptProjectWorkflowMap(raw);
}
