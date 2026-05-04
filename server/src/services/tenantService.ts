import type { Knex } from 'knex';
import { db } from '../db/knex.js';
import { Tenant, type TenantRow } from '../entities/Tenant.js';
import type { TenantStatus } from '../lib/constants.js';

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
  'status',
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

export async function create(
  input: CreateTenantInput,
  trx?: Knex.Transaction
): Promise<Tenant> {
  const q = (trx ?? db)('tenants');
  const [row] = (await q
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

export async function setStatus(id: string, status: TenantStatus): Promise<Tenant | null> {
  const [row] = (await db('tenants')
    .where('id', id)
    .update({ status, updatedAt: db.fn.now() })
    .returning(COLUMNS)) as TenantRow[];
  return row ? Tenant.fromRow(row) : null;
}

export interface ListForUserOptions {
  /** When true, deactivated tenants are included in the result. Default false. */
  includeDeactivated?: boolean;
}

/**
 * Tenants visible to a single user — the union of every tenant they have a
 * (non-deactivated) membership in. Deactivated tenants are hidden by default.
 */
export async function listForUser(
  userId: string,
  opts: ListForUserOptions = {}
): Promise<Tenant[]> {
  const q = db('tenants as t')
    .join('tenant_memberships as m', 't.id', 'm.tenant_id')
    .where('m.user_id', userId)
    .whereIn('m.status', ['active', 'invited']);
  if (!opts.includeDeactivated) q.where('t.status', 'active');
  const rows = (await q
    .select(COLUMNS.map((c) => `t.${c}`))
    .orderBy('t.name', 'asc')) as TenantRow[];
  return rows.map(Tenant.fromRow);
}
