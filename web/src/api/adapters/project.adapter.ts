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
  const id = requireField(raw.id, '', { entity: 'Project', field: 'id' });

  const slug = requireField(raw.slug, '', { entity: 'Project', field: 'slug', id });
  const key = requireField(raw.key, '', { entity: 'Project', field: 'key', id });
  const name = requireField(raw.name, '', { entity: 'Project', field: 'name', id });
  const status = requireField<'active' | 'archived'>(raw.status, 'active', {
    entity: 'Project', field: 'status', id,
  });

  const letter = expectField(raw.letter, name[0]?.toUpperCase() ?? '?', {
    entity: 'Project', field: 'letter', id,
  });
  const color = expectField(raw.color, '#4f46e5', { entity: 'Project', field: 'color', id });
  const bg = expectField(raw.bg, '#e0e7ff', { entity: 'Project', field: 'bg', id });
  const description = expectField(raw.description, '', {
    entity: 'Project', field: 'description', id,
  });

  return {
    id,
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
    // Slice 4 FE (2026-05-05): the project list endpoint does NOT return team
    // or user grants — those live on `GET .../projects/:p/access` and are
    // consumed via `useProjectAccess()` (`web/src/state/project-access.tsx`).
    // We deliberately keep `teamSlugs` / `userEmails` empty here rather than
    // fan-out N access calls per project list. Callers that need the access
    // view should mount `<ProjectAccessProvider>` on the project page.
    // The legacy fixture-driven `projectsForTeam(slug)` reverse lookup is
    // therefore stale; until the BE adds a reverse-lookup endpoint, the
    // team-detail "projects using this team" surface renders empty for
    // API-loaded projects (still works for SEED_PROJECTS in the demo
    // workspace because they carry hardcoded slugs).
    teamSlugs: [],
    userEmails: [],
  };
}
