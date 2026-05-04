import { apiFetch } from './client';
import {
  adaptWorkspaceListItem, adaptWorkspace, type RawWorkspace,
} from './adapters/workspace.adapter';
import type { Workspace, Role } from '../fixtures';
import type { AddWorkspaceInput } from '../state/workspaces';

export async function listWorkspaces(tenantSlug: string): Promise<Workspace[]> {
  const items = await apiFetch<Array<{ workspace: RawWorkspace; role: Role }>>(
    `/api/tenants/${tenantSlug}/workspaces`,
  );
  return items.map((item) => adaptWorkspaceListItem(item, tenantSlug));
}

export async function createWorkspace(
  tenantSlug: string,
  input: AddWorkspaceInput,
): Promise<Workspace> {
  const raw = await apiFetch<RawWorkspace>(
    `/api/tenants/${tenantSlug}/workspaces`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return adaptWorkspace(raw, tenantSlug, 'admin');
}

export async function updateWorkspace(
  tenantSlug: string,
  workspaceSlug: string,
  patch: { name?: string; letter?: string; color?: string; bg?: string },
): Promise<Workspace> {
  const raw = await apiFetch<RawWorkspace>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
  return adaptWorkspace(raw, tenantSlug, 'admin');
}

export async function archiveWorkspace(
  tenantSlug: string,
  workspaceSlug: string,
): Promise<void> {
  await apiFetch(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/archive`,
    { method: 'POST' },
  );
}

export async function unarchiveWorkspace(
  tenantSlug: string,
  workspaceSlug: string,
): Promise<void> {
  await apiFetch(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/unarchive`,
    { method: 'POST' },
  );
}
