// API client for project milestones. Mirrors the structure of `issues.ts` —
// each function `apiFetch`es the BE endpoint, runs the response through the
// milestone adapter, and returns the FE-shaped `Milestone`. The provider
// (`state/milestones.tsx`) is the only consumer; screens never call these
// directly.

import { apiFetch } from './client';
import { adaptMilestone, type RawMilestone } from './adapters/milestone.adapter';
import type { Milestone } from '../fixtures';

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface MilestoneListFilters {
  /** Workspace-scoped only — ignored on the project-scoped endpoint. */
  projectId?: string;
}

function buildQuery(filters: MilestoneListFilters | undefined): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * Workspace-scoped list — the provider's mount-time fetch.
 */
export async function listWorkspaceMilestones(
  tenantSlug: string,
  workspaceSlug: string,
  filters?: MilestoneListFilters,
): Promise<Milestone[]> {
  const items = await apiFetch<RawMilestone[]>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/milestones${buildQuery(filters)}`,
  );
  return items.map(adaptMilestone);
}

/**
 * Project-scoped list — currently unused by the provider (the workspace
 * endpoint plus a client-side filter is enough), but exposed for one-off
 * callers / future surfaces.
 */
export async function listProjectMilestones(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
): Promise<Milestone[]> {
  const items = await apiFetch<RawMilestone[]>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/milestones`,
  );
  return items.map(adaptMilestone);
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function getMilestone(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  id: string,
): Promise<Milestone> {
  const raw = await apiFetch<RawMilestone>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/milestones/${id}`,
  );
  return adaptMilestone(raw);
}

// ---------------------------------------------------------------------------
// Write paths
// ---------------------------------------------------------------------------

export interface CreateMilestonePayload {
  name: string;
  description?: string | null;
  /** ISO YYYY-MM-DD. */
  date: string;
}

export async function createMilestone(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  input: CreateMilestonePayload,
): Promise<Milestone> {
  const raw = await apiFetch<RawMilestone>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/milestones`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return adaptMilestone(raw);
}

export interface UpdateMilestonePayload {
  name?: string;
  description?: string | null;
  date?: string;
}

export async function updateMilestone(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  id: string,
  patch: UpdateMilestonePayload,
): Promise<Milestone> {
  const raw = await apiFetch<RawMilestone>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/milestones/${id}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
  return adaptMilestone(raw);
}

export async function deleteMilestone(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  id: string,
): Promise<void> {
  await apiFetch<void>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/milestones/${id}`,
    { method: 'DELETE' },
  );
}
