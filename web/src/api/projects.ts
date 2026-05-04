import { apiFetch } from './client';
import { adaptProject, type RawProject } from './adapters/project.adapter';
import type { Project } from '../fixtures';

export interface CreateProjectApiInput {
  slug: string;
  key: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
  description?: string;
}

export async function listProjects(
  tenantSlug: string,
  workspaceSlug: string,
): Promise<Project[]> {
  const items = await apiFetch<RawProject[]>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects`,
  );
  return items.map(adaptProject);
}

export async function createProject(
  tenantSlug: string,
  workspaceSlug: string,
  input: CreateProjectApiInput,
): Promise<Project> {
  const raw = await apiFetch<RawProject>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return adaptProject(raw);
}
