import { db } from '../../db/knex.js';
import { AppError } from '../../lib/errors.js';
import * as tenantService from '../../services/tenantService.js';
import * as membershipService from '../../services/membershipService.js';
import type { Tenant } from '../../entities/Tenant.js';

export interface CreateTenantInput {
  /** id of the user creating the tenant — becomes its first admin. */
  creatorUserId: string;
  slug: string;
  name: string;
  letter: string;
  color: string;
  bg: string;
  plan?: string;
}

/**
 * Create a tenant and grant the caller `admin` membership in the same
 * transaction. v1 lets any authenticated user spin up their own tenant; the
 * creator owns it from then on.
 *
 * Slug must be globally unique (it's load-bearing in `/:tenantSlug/...`
 * URLs and FE localStorage keys, so collisions can't be silent).
 */
export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  const existing = await tenantService.findBySlug(input.slug);
  if (existing) {
    throw new AppError(`A tenant with slug '${input.slug}' already exists`, 409);
  }

  return db.transaction(async (trx) => {
    const tenant = await tenantService.create(
      {
        slug: input.slug,
        name: input.name,
        letter: input.letter,
        color: input.color,
        bg: input.bg,
        plan: input.plan,
      },
      trx
    );

    await membershipService.addTenantMember(
      {
        userId: input.creatorUserId,
        tenantId: tenant.id,
        role: 'admin',
        status: 'active',
      },
      trx
    );

    return tenant;
  });
}
