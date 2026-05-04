import type { Knex } from 'knex';
import { hashPassword } from '../../src/lib/passwordUtils.js';

/**
 * Seed: a single demo tenant (Acme Corp) with a single admin user
 * (Jordan Lee), three workspaces (Acme Robotics, Nimbus Labs, Polar Tooling),
 * and three projects in the Acme Robotics workspace (Comet, Orbit, Atlas).
 *
 * Mirrors what `web/src/fixtures.ts` exposes today so the FE has a
 * recognisable shape if/when it gets pointed at the API.
 *
 * Idempotent: deletes by slug/email before inserting.
 */
export async function seed(knex: Knex): Promise<void> {
  // Wipe in dependency order. Project / membership cascades handle the rest.
  await knex('projects').del();
  await knex('workspace_memberships').del();
  await knex('workspaces').del();
  await knex('tenant_memberships').del();
  await knex('tenants').del();
  await knex('users').del();

  // ── Users ────────────────────────────────────────────────────────────
  const passwordHash = await hashPassword('password123');
  const [jordan] = (await knex('users')
    .insert({
      email: 'jordan@acme.com',
      passwordHash,
      firstName: 'Jordan',
      lastName: 'Lee',
      isActive: true,
    })
    .returning(['id', 'email'])) as Array<{ id: string; email: string }>;

  // ── Tenant ───────────────────────────────────────────────────────────
  const [acmeCorp] = (await knex('tenants')
    .insert({
      slug: 'acme-corp',
      name: 'Acme Corp',
      letter: 'A',
      color: '#4f46e5',
      bg: '#e0e7ff',
      plan: 'free',
    })
    .returning(['id', 'slug'])) as Array<{ id: string; slug: string }>;

  // ── Tenant membership: Jordan = admin ────────────────────────────────
  await knex('tenant_memberships').insert({
    userId: jordan.id,
    tenantId: acmeCorp.id,
    role: 'admin',
    status: 'active',
  });

  // ── Workspaces ───────────────────────────────────────────────────────
  const workspacesSeed = [
    { slug: 'acme', name: 'Acme Robotics', letter: 'A', color: '#4f46e5', bg: '#e0e7ff' },
    { slug: 'nimbus', name: 'Nimbus Labs', letter: 'N', color: '#0891b2', bg: '#cffafe' },
    { slug: 'polar', name: 'Polar Tooling', letter: 'P', color: '#9333ea', bg: '#f3e8ff' },
  ];
  const workspaces = (await knex('workspaces')
    .insert(workspacesSeed.map((w) => ({ ...w, tenantId: acmeCorp.id })))
    .returning(['id', 'slug'])) as Array<{ id: string; slug: string }>;

  const acmeWorkspace = workspaces.find((w) => w.slug === 'acme');
  if (!acmeWorkspace) throw new Error('Seed: acme workspace insert failed');

  // ── Projects (in the `acme` workspace only) ──────────────────────────
  const projectsSeed = [
    {
      slug: 'comet',
      key: 'CMT',
      name: 'Comet',
      letter: 'C',
      color: '#4f46e5',
      bg: '#e0e7ff',
      description:
        'Internal issue tracker. Self-hostable, role-aware, opinionated about workflows.',
      status: 'active',
    },
    {
      slug: 'orbit',
      key: 'ORB',
      name: 'Orbit',
      letter: 'O',
      color: '#0891b2',
      bg: '#cffafe',
      description: 'Customer-facing dashboard and analytics.',
      status: 'active',
    },
    {
      slug: 'atlas',
      key: 'ATL',
      name: 'Atlas',
      letter: 'A',
      color: '#16a34a',
      bg: '#dcfce7',
      description: 'Map / geospatial features for the platform.',
      status: 'active',
    },
  ];

  await knex('projects').insert(
    projectsSeed.map((p) => ({
      ...p,
      workspaceId: acmeWorkspace.id,
      createdByUserId: jordan.id,
    }))
  );

  // eslint-disable-next-line no-console
  console.log(
    `Seeded: 1 user (jordan@acme.com / password123), 1 tenant (acme-corp), 3 workspaces, 3 projects`
  );
}
