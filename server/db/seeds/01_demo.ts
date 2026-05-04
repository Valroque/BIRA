import type { Knex } from 'knex';
import { hashPassword } from '../../src/lib/passwordUtils.js';

/**
 * Seed:
 *   1. DreamStreet — primary tenant, with one admin (admin@dreamstreet.io).
 *      Tenants are seed-only in v1, so this is how DreamStreet exists at all.
 *   2. Acme Corp — long-standing demo tenant kept for the existing fixture
 *      surface (workspaces, projects, multi-user role mix).
 *
 * Idempotent: wipes by table before inserting.
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
  // All four "normal" demo users share the same password except Riley,
  // who exists pre-locked with a known temp password so the FE can
  // exercise the must-reset gate without first hitting the admin-reset
  // endpoint.
  const standardPasswordHash = await hashPassword('password123');
  const rileyTempHash = await hashPassword('temp-riley-1234');

  const userRows = (await knex('users')
    .insert([
      {
        email: 'admin@dreamstreet.io',
        passwordHash: standardPasswordHash,
        firstName: 'Dream',
        lastName: 'Admin',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'jordan@acme.com',
        passwordHash: standardPasswordHash,
        firstName: 'Jordan',
        lastName: 'Lee',
        phone: '+1-555-0100',
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'sam@acme.com',
        passwordHash: standardPasswordHash,
        firstName: 'Sam',
        lastName: 'Rivera',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'morgan@acme.com',
        passwordHash: standardPasswordHash,
        firstName: 'Morgan',
        lastName: 'Patel',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'riley@acme.com',
        passwordHash: rileyTempHash,
        firstName: 'Riley',
        lastName: 'Chen',
        phone: null,
        isActive: true,
        mustResetPassword: true,
      },
    ])
    .returning(['id', 'email'])) as Array<{ id: string; email: string }>;

  const userByEmail = new Map(userRows.map((u) => [u.email, u.id]));
  const idFor = (email: string): string => {
    const id = userByEmail.get(email);
    if (!id) throw new Error(`Seed: user insert for ${email} failed`);
    return id;
  };

  // ── Tenants ──────────────────────────────────────────────────────────
  const tenantRows = (await knex('tenants')
    .insert([
      {
        slug: 'dreamstreet',
        name: 'DreamStreet',
        letter: 'D',
        color: '#4f46e5',
        bg: '#e0e7ff',
        plan: 'free',
        status: 'active',
      },
      {
        slug: 'acme-corp',
        name: 'Acme Corp',
        letter: 'A',
        color: '#0891b2',
        bg: '#cffafe',
        plan: 'free',
        status: 'active',
      },
    ])
    .returning(['id', 'slug'])) as Array<{ id: string; slug: string }>;

  const tenantBySlug = new Map(tenantRows.map((t) => [t.slug, t.id]));
  const dreamStreetId = tenantBySlug.get('dreamstreet')!;
  const acmeCorpId = tenantBySlug.get('acme-corp')!;

  // ── Tenant memberships ───────────────────────────────────────────────
  // DreamStreet has one admin. Acme has the multi-role demo cast.
  await knex('tenant_memberships').insert([
    { userId: idFor('admin@dreamstreet.io'), tenantId: dreamStreetId, role: 'admin', status: 'active' },
    { userId: idFor('jordan@acme.com'), tenantId: acmeCorpId, role: 'admin', status: 'active' },
    { userId: idFor('sam@acme.com'), tenantId: acmeCorpId, role: 'admin', status: 'active' },
    { userId: idFor('morgan@acme.com'), tenantId: acmeCorpId, role: 'write', status: 'active' },
    { userId: idFor('riley@acme.com'), tenantId: acmeCorpId, role: 'write', status: 'active' },
  ]);

  // ── Workspaces ───────────────────────────────────────────────────────
  const workspacesSeed = [
    { slug: 'acme', name: 'Acme Robotics', letter: 'A', color: '#4f46e5', bg: '#e0e7ff' },
    { slug: 'nimbus', name: 'Nimbus Labs', letter: 'N', color: '#0891b2', bg: '#cffafe' },
    { slug: 'polar', name: 'Polar Tooling', letter: 'P', color: '#9333ea', bg: '#f3e8ff' },
  ];
  const workspaces = (await knex('workspaces')
    .insert(workspacesSeed.map((w) => ({ ...w, tenantId: acmeCorpId })))
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
      createdByUserId: idFor('jordan@acme.com'),
    }))
  );

  // eslint-disable-next-line no-console
  console.log(
    [
      'Seeded: 2 tenants (dreamstreet, acme-corp), 3 workspaces, 3 projects, and 5 users:',
      '  admin@dreamstreet.io / password123        (dreamstreet admin)',
      '  jordan@acme.com      / password123        (acme admin)',
      '  sam@acme.com         / password123        (acme admin)',
      '  morgan@acme.com      / password123        (acme write)',
      '  riley@acme.com       / temp-riley-1234    (acme write, mustResetPassword=true)',
    ].join('\n')
  );
}
