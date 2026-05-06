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
// Adapter
// ---------------------------------------------------------------------------

/**
 * Adapt a raw tenant row from the BE. The public list endpoint
 * (`GET /api/tenants`) returns plain tenant rows — no per-user role.
 */
export function adaptTenant(raw: RawTenant): Tenant {
  const id = requireField(raw.id, '', { entity: 'Tenant', field: 'id' });
  const slug = requireField(raw.slug, '', { entity: 'Tenant', field: 'slug', id });
  const name = requireField(raw.name, '', { entity: 'Tenant', field: 'name', id });
  const letter = expectField(raw.letter, name[0]?.toUpperCase() ?? '?', {
    entity: 'Tenant', field: 'letter', id,
  });
  const color = expectField(raw.color, 'var(--fg-muted)', { entity: 'Tenant', field: 'color', id });
  const bg = expectField(raw.bg, 'var(--bg-muted)', { entity: 'Tenant', field: 'bg', id });
  const status = expectField<'active' | 'deactivated'>(raw.status, 'active', {
    entity: 'Tenant', field: 'status', id,
  });

  return {
    id,
    slug,
    name,
    letter,
    color,
    bg,
    status,
  };
}
