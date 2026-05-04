import type { Tenant } from '../../fixtures';
import { requireField, expectField } from '../lib/adapterContract';

// ---------------------------------------------------------------------------
// Raw BE shape
// ---------------------------------------------------------------------------

export interface RawTenant {
  id: string;
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
  plan: string;
  status: 'active' | 'deactivated';
  createdAt: string;
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/**
 * Adapt a raw tenant + role pair (from the list endpoint) into the FE Tenant.
 */
export function adaptTenantListItem(item: { tenant: RawTenant; role: string }): Tenant {
  const raw = item.tenant;
  const id = raw.id ?? raw.slug;

  const slug = requireField(raw.slug, '', { entity: 'Tenant', field: 'slug', id });
  const name = requireField(raw.name, '', { entity: 'Tenant', field: 'name', id: slug });
  const letter = requireField(raw.letter, name[0] ?? '?', { entity: 'Tenant', field: 'letter', id: slug });
  const color = requireField(raw.color, 'var(--fg-muted)', { entity: 'Tenant', field: 'color', id: slug });
  const bg = requireField(raw.bg, 'var(--bg-muted)', { entity: 'Tenant', field: 'bg', id: slug });
  const status = expectField<'active' | 'deactivated'>(raw.status, 'active', {
    entity: 'Tenant', field: 'status', id: slug,
  });

  return {
    slug,
    name,
    letter,
    color,
    bg,
    role: (item.role as Tenant['role']) ?? 'read',
    workspaceCount: 0,
    memberCount: 0,
    status,
  };
}

/**
 * Adapt a raw tenant without a role context (e.g. create-tenant response).
 * Caller must supply the role separately.
 */
export function adaptTenant(raw: RawTenant): Omit<Tenant, 'role'> {
  const id = raw.id ?? raw.slug;
  const slug = requireField(raw.slug, '', { entity: 'Tenant', field: 'slug', id });
  const name = requireField(raw.name, '', { entity: 'Tenant', field: 'name', id: slug });
  const letter = requireField(raw.letter, name[0] ?? '?', { entity: 'Tenant', field: 'letter', id: slug });
  const color = requireField(raw.color, 'var(--fg-muted)', { entity: 'Tenant', field: 'color', id: slug });
  const bg = requireField(raw.bg, 'var(--bg-muted)', { entity: 'Tenant', field: 'bg', id: slug });
  const status = expectField<'active' | 'deactivated'>(raw.status, 'active', {
    entity: 'Tenant', field: 'status', id: slug,
  });

  return {
    slug,
    name,
    letter,
    color,
    bg,
    workspaceCount: 0,
    memberCount: 0,
    status,
  };
}
