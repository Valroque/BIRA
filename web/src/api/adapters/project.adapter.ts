import type { Project } from '../../fixtures';
import { DEFAULT_PROJECT_WORKFLOWS } from '../../fixtures';
import { requireField, expectField } from '../lib/adapterContract';

// ---------------------------------------------------------------------------
// Raw BE shape
// ---------------------------------------------------------------------------

export interface RawProject {
  id: string;
  workspaceId: string;
  slug: string;
  key: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
  description: string;
  status: 'active' | 'archived';
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function adaptProject(raw: RawProject): Project {
  const id = raw.id ?? raw.slug;

  const slug = requireField(raw.slug, '', { entity: 'Project', field: 'slug', id });
  const key = requireField(raw.key, '', { entity: 'Project', field: 'key', id: slug });
  const name = requireField(raw.name, '', { entity: 'Project', field: 'name', id: slug });
  const status = requireField<'active' | 'archived'>(raw.status, 'active', {
    entity: 'Project', field: 'status', id: slug,
  });

  const letter = expectField(raw.letter, name[0]?.toUpperCase() ?? '?', {
    entity: 'Project', field: 'letter', id: slug,
  });
  const color = expectField(raw.color, '#4f46e5', { entity: 'Project', field: 'color', id: slug });
  const bg = expectField(raw.bg, '#e0e7ff', { entity: 'Project', field: 'bg', id: slug });
  const description = expectField(raw.description, '', {
    entity: 'Project', field: 'description', id: slug,
  });

  return {
    slug,
    key,
    name,
    letter,
    color,
    bg,
    description,
    status,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    // BE only has createdByUserId — no email available without a join.
    createdByEmail: '',
    workflows: { ...DEFAULT_PROJECT_WORKFLOWS },
    teamSlugs: [],
    userEmails: [],
  };
}
