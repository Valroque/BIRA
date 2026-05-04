import type { Knex } from 'knex';
import { hashPassword } from '../../src/lib/passwordUtils.js';

/**
 * Seed: a single demo tenant (Acme Corp) with four demo users
 * (Jordan = admin, Sam = admin, Morgan = write, Riley = write/locked),
 * three workspaces (Acme Robotics, Nimbus Labs, Polar Tooling), and
 * three projects in the Acme Robotics workspace (Comet, Orbit, Atlas).
 *
 * Mirrors what `web/src/fixtures.ts` exposes today so the FE has a
 * recognisable shape if/when it gets pointed at the API. Riley exists
 * pre-locked (`mustResetPassword: true`) so the FE / manual QA can
 * exercise the must-reset gate without first running the admin-reset
 * endpoint.
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
  // All four "normal" demo users share the same password except Riley,
  // who exists pre-locked with a known temp password so the FE can
  // exercise the must-reset gate without first hitting the admin-reset
  // endpoint.
  const standardPasswordHash = await hashPassword('password123');
  const rileyTempHash = await hashPassword('temp-riley-1234');

  const userRows = (await knex('users')
    .insert([
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

  // ── Tenant ───────────────────────────────────────────────────────────
  const [acmeCorp] = (await knex('tenants')
    .insert({
      slug: 'acme-corp',
      name: 'Acme Corp',
      letter: 'A',
      color: '#4f46e5',
      bg: '#e0e7ff',
      plan: 'free',
      status: 'active',
    })
    .returning(['id', 'slug'])) as Array<{ id: string; slug: string }>;

  // ── Tenant memberships ───────────────────────────────────────────────
  // Jordan + Sam are admins (Sam exists so admin-vs-admin flows like
  // self-target rejection have a second admin to act as). Morgan is
  // `write`. Riley is `write` and pre-locked.
  await knex('tenant_memberships').insert([
    { userId: idFor('jordan@acme.com'), tenantId: acmeCorp.id, role: 'admin', status: 'active' },
    { userId: idFor('sam@acme.com'), tenantId: acmeCorp.id, role: 'admin', status: 'active' },
    { userId: idFor('morgan@acme.com'), tenantId: acmeCorp.id, role: 'write', status: 'active' },
    { userId: idFor('riley@acme.com'), tenantId: acmeCorp.id, role: 'write', status: 'active' },
  ]);

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
      createdByUserId: idFor('jordan@acme.com'),
    }))
  );

  // eslint-disable-next-line no-console
  console.log(
    [
      'Seeded: 1 tenant (acme-corp), 3 workspaces, 3 projects, and 4 users:',
      '  jordan@acme.com  / password123        (admin)',
      '  sam@acme.com     / password123        (admin)',
      '  morgan@acme.com  / password123        (write)',
      '  riley@acme.com   / temp-riley-1234    (write, mustResetPassword=true)',
    ].join('\n')
  );
}
