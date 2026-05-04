import { db } from '../db/knex.js';
import { Tenant, type TenantRow } from '../entities/Tenant.js';

/**
 * Thin data-access service for the `tenants` table.
 */

const COLUMNS = [
  'id',
  'slug',
  'name',
  'letter',
  'color',
  'bg',
  'plan',
  'created_at',
  'updated_at',
] as const;

export async function getById(id: string): Promise<Tenant | null> {
  const row = (await db('tenants').where('id', id).select(COLUMNS).first()) as
    | TenantRow
    | undefined;
  return row ? Tenant.fromRow(row) : null;
}

export async function findBySlug(slug: string): Promise<Tenant | null> {
  const row = (await db('tenants')
    .whereRaw('LOWER(slug) = LOWER(?)', [slug])
    .select(COLUMNS)
    .first()) as TenantRow | undefined;
  return row ? Tenant.fromRow(row) : null;
}

export interface CreateTenantInput {
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
  plan?: string;
}

export async function create(input: CreateTenantInput): Promise<Tenant> {
  const [row] = (await db('tenants')
    .insert({
      slug: input.slug,
      name: input.name,
      letter: input.letter,
      color: input.color,
      bg: input.bg,
      plan: input.plan ?? 'free',
    })
    .returning(COLUMNS)) as TenantRow[];
  return Tenant.fromRow(row);
}

/**
 * Tenants visible to a single user — the union of every tenant they have a
 * (non-deactivated) membership in.
 */
export async function listForUser(userId: string): Promise<Tenant[]> {
  const rows = (await db('tenants as t')
    .join('tenant_memberships as m', 't.id', 'm.tenant_id')
    .where('m.user_id', userId)
    .whereIn('m.status', ['active', 'invited'])
    .select(COLUMNS.map((c) => `t.${c}`))
    .orderBy('t.name', 'asc')) as TenantRow[];
  return rows.map(Tenant.fromRow);
}
