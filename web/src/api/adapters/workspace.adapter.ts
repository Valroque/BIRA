import type { Workspace, Role } from '../../fixtures';
import { requireField, expectField } from '../lib/adapterContract';

// ---------------------------------------------------------------------------
// Raw BE shape
// ---------------------------------------------------------------------------

export interface RawWorkspace {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/**
 * Adapt a workspace list item (workspace + role) into the FE Workspace.
 * `tenantSlug` is supplied by the call context — it isn't in the BE response.
 */
export function adaptWorkspaceListItem(
  item: { workspace: RawWorkspace; role: Role },
  tenantSlug: string,
): Workspace {
  const raw = item.workspace;
  const id = raw.id ?? raw.slug;

  const slug = requireField(raw.slug, '', { entity: 'Workspace', field: 'slug', id });
  const name = requireField(raw.name, '', { entity: 'Workspace', field: 'name', id: slug });
  const letter = requireField(raw.letter, name[0] ?? '?', { entity: 'Workspace', field: 'letter', id: slug });
  const color = requireField(raw.color, 'var(--fg-muted)', { entity: 'Workspace', field: 'color', id: slug });
  const bg = requireField(raw.bg, 'var(--bg-muted)', { entity: 'Workspace', field: 'bg', id: slug });
  const status = requireField<'active' | 'archived'>(raw.status, 'active', {
    entity: 'Workspace', field: 'status', id: slug,
  });
  const role = expectField<Role>(item.role, 'read', { entity: 'Workspace', field: 'role', id: slug });

  return {
    tenantSlug,
    slug,
    name,
    letter,
    color,
    bg,
    projectCount: 0,
    memberCount: 0,
    role,
    archived: status === 'archived',
  };
}

/**
 * Adapt a raw workspace without a role (e.g. create / archive response).
 * The caller must supply tenantSlug and role separately.
 */
export function adaptWorkspace(
  raw: RawWorkspace,
  tenantSlug: string,
  role: Role = 'admin',
): Workspace {
  return adaptWorkspaceListItem({ workspace: raw, role }, tenantSlug);
}
