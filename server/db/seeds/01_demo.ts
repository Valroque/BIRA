import type { Knex } from 'knex';
import { hashPassword } from '../../src/lib/passwordUtils.js';
import { seedDefaultWorkflowsForWorkspace } from '../../src/lib/defaultWorkflows.js';

/**
 * Seed:
 *   1. DreamStreet — primary tenant, with one admin (admin@dreamstreet.io).
 *      Tenants are seed-only in v1, so this is how DreamStreet exists at all.
 *      Intentionally workspace-less / workflow-less so manual QA can exercise
 *      the `noWorkflow` permissive fallback in `evaluateTransition`.
 *   2. Acme Corp — long-standing demo tenant kept for the existing fixture
 *      surface (workspaces, projects, multi-user role mix). Acme additionally
 *      gets the full FE-fixture data: workflows + transitions + transition
 *      rules, project_workflow assignments, issues, parent/child
 *      hierarchy, and relates / depends-on links. This is the path that
 *      exercises the status-guard logic end-to-end.
 *
 * Idempotent: wipes by table before inserting (in dependency order).
 */
export async function seed(knex: Knex): Promise<void> {
  // Wipe in dependency order (most-dependent first). Most of the issue-graph
  // tables would CASCADE through the workspace wipe further down, but
  // explicit deletes keep the seed readable + order-independent.
  await knex('issue_dependencies').del();
  await knex('issue_relates').del();
  await knex('issues').del();
  await knex('workflow_transition_rules').del();
  await knex('workflow_transitions').del();
  await knex('project_workflows').del();
  await knex('workflow_nodes').del();
  await knex('workflows').del();
  await knex('projects').del();
  await knex('workspace_memberships').del();
  await knex('workspaces').del();
  await knex('tenant_memberships').del();
  await knex('tenants').del();
  await knex('users').del();

  // ── Users ────────────────────────────────────────────────────────────
  // The four "normal" demo users share the same password except Riley,
  // who exists pre-locked with a known temp password so the FE can
  // exercise the must-reset gate without first hitting the admin-reset
  // endpoint.
  //
  // Maya / Priya / Avery were added so every fixture-assigned user has a
  // real user row to point assigneeUserId at. Sam Park (in fixtures)
  // collapses onto the existing sam@acme.com (Sam Rivera) — the email is
  // what the API cares about, the display name diverges only in the FE
  // fixture.
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
      {
        email: 'maya@acme.com',
        passwordHash: standardPasswordHash,
        firstName: 'Maya',
        lastName: 'Chen',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'priya@acme.com',
        passwordHash: standardPasswordHash,
        firstName: 'Priya',
        lastName: 'Rao',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'avery@acme.com',
        passwordHash: standardPasswordHash,
        firstName: 'Avery',
        lastName: 'Kim',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
    ])
    .returning(['id', 'email'])) as Array<{ id: string; email: string }>;

  const userByEmail = new Map(userRows.map((u) => [u.email, u.id]));
  const idFor = (email: string): string => {
    const id = userByEmail.get(email);
    if (!id) throw new Error(`Seed: user insert for ${email} failed`);
    return id;
  };

  // FE fixture display name → BE user email. Used to map `Issue.assignee`
  // strings to assigneeUserId. Anyone outside this map falls back to
  // jordan@acme.com (and is logged when that happens).
  const assigneeNameToEmail: Record<string, string> = {
    'Jordan Lee': 'jordan@acme.com',
    'Sam Park': 'sam@acme.com',
    'Maya Chen': 'maya@acme.com',
    'Priya Rao': 'priya@acme.com',
    'Avery Kim': 'avery@acme.com',
    'Riley Singh': 'riley@acme.com',
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
    { userId: idFor('maya@acme.com'), tenantId: acmeCorpId, role: 'write', status: 'active' },
    { userId: idFor('priya@acme.com'), tenantId: acmeCorpId, role: 'write', status: 'active' },
    { userId: idFor('avery@acme.com'), tenantId: acmeCorpId, role: 'read', status: 'active' },
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
  const acmeWorkspaceId = acmeWorkspace.id;

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

  const projectRows = (await knex('projects')
    .insert(
      projectsSeed.map((p) => ({
        ...p,
        workspaceId: acmeWorkspaceId,
        createdByUserId: idFor('jordan@acme.com'),
      }))
    )
    .returning(['id', 'slug'])) as Array<{ id: string; slug: string }>;

  const projectIdBySlug = new Map(projectRows.map((p) => [p.slug, p.id]));
  const projectIdFor = (slug: string): string => {
    const id = projectIdBySlug.get(slug);
    if (!id) throw new Error(`Seed: project '${slug}' missing`);
    return id;
  };

  // ── Workflows (Acme only) ────────────────────────────────────────────
  // Source of truth is `src/lib/defaultWorkflows.ts` — both this seed and
  // `createWorkspace` route through `seedDefaultWorkflowsForWorkspace`,
  // so every freshly-created workspace ships with the same three
  // templates Acme is seeded with.
  let workflowIdBySlug = new Map<string, string>();
  await knex.transaction(async (trx) => {
    workflowIdBySlug = await seedDefaultWorkflowsForWorkspace(trx, acmeWorkspaceId);
  });

  // ── Project ↔ workflow assignments ──────────────────────────────────
  // From SEED_PROJECTS[].workflows in web/src/fixtures.ts:
  //   Comet & Orbit: T/B/S -> default,  E -> epic-coarse
  //   Atlas       : T/B/S -> default,  E -> epic-detailed
  const projectWorkflowsSeed: Array<{
    projectSlug: string;
    workflows: Record<'T' | 'B' | 'S' | 'E', string>;
  }> = [
    {
      projectSlug: 'comet',
      workflows: { T: 'default', B: 'default', S: 'default', E: 'epic-coarse' },
    },
    {
      projectSlug: 'orbit',
      workflows: { T: 'default', B: 'default', S: 'default', E: 'epic-coarse' },
    },
    {
      projectSlug: 'atlas',
      workflows: { T: 'default', B: 'default', S: 'default', E: 'epic-detailed' },
    },
  ];

  const projectWorkflowInserts: Array<{
    projectId: string;
    issueType: string;
    workflowId: string;
  }> = [];
  for (const pw of projectWorkflowsSeed) {
    const projectId = projectIdFor(pw.projectSlug);
    for (const issueType of ['T', 'B', 'S', 'E'] as const) {
      const workflowId = workflowIdBySlug.get(pw.workflows[issueType]);
      if (!workflowId) {
        throw new Error(
          `Seed: workflow '${pw.workflows[issueType]}' missing for ${pw.projectSlug}/${issueType}`
        );
      }
      projectWorkflowInserts.push({ projectId, issueType, workflowId });
    }
  }
  await knex('project_workflows').insert(projectWorkflowInserts);

  // ── Issues ──────────────────────────────────────────────────────────
  // Mirrors `ISSUES` in web/src/fixtures.ts. Two-pass insert:
  //   1. Insert all issues without parent (so any FE parent reference can
  //      be resolved against the just-built key->id map).
  //   2. Update parent_issue_id on the rows that have one.
  // After issues exist we can insert relates / dependencies.

  type IssueSeed = {
    feKey: string; // e.g. 'CMT-241'
    projectSlug: string;
    type: 'T' | 'B' | 'S' | 'E';
    title: string;
    status: 'backlog' | 'todo' | 'in-progress' | 'in-review' | 'done' | 'canceled';
    priority: 'urgent' | 'high' | 'med' | 'low' | 'none';
    assigneeName: string;
    labels: string[];
    estimate: number | null;
    startDate: string | null;
    endDate: string | null;
    parentFeKey: string | null;
    relatedToFeKeys: string[];
    dependsOnFeKeys: string[];
    description: string | null;
  };

  // Hand-mirrored from ISSUES. Type-gated per slice 6 rules — we drop
  // estimate/startDate/endDate from any Story/Epic that the fixture set
  // them on (the FE keeps them as a roll-up hint; the BE doesn't store
  // them at the container level). Every dropped field is annotated.
  const issueSeeds: IssueSeed[] = [
    // --- Comet ---
    {
      feKey: 'CMT-241', projectSlug: 'comet', type: 'B',
      title: 'Reorder of states corrupts saved view state when filter is active',
      status: 'in-review', priority: 'urgent', assigneeName: 'Maya Chen',
      labels: ['regression', 'workflow'], estimate: 3,
      startDate: '2026-04-22', endDate: '2026-04-29',
      parentFeKey: null, relatedToFeKeys: ['CMT-229'],
      dependsOnFeKeys: [],
      description: `Saving the workflow editor's view state (filter chips, expanded sections) writes through a debounced effect. When a state node is reordered while a filter is active, the persisted slot order is computed from the visible subset and reapplied to the full set on reload — silently dropping nodes that were filtered out.

Repro:
1. Open /comet/workflow
2. Apply filter type:terminal
3. Drag any visible node to a new position
4. Reload — non-terminal states are missing from the saved order

Suspected fix is to reorder over the *full* set, not the filtered subset:

\`\`\`ts
const persist = debounce((view) => {
  const next = mergeOrder(allNodes, view.visibleOrder);
  storage.set('workflow:order', next);
}, 250);
\`\`\``,
    },
    // CMT-238 is a Story; FE fixture sets estimate=8 — Stories don't store
    // estimate on the BE per slice 6 rules (rolls up from descendants).
    {
      feKey: 'CMT-238', projectSlug: 'comet', type: 'S',
      title: 'Allow workspace admins to fork the default workflow per project',
      status: 'in-progress', priority: 'high', assigneeName: 'Jordan Lee',
      labels: ['workflow', 'admin'], estimate: null,
      startDate: null, endDate: null,
      parentFeKey: 'CMT-232', relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    {
      feKey: 'CMT-237', projectSlug: 'comet', type: 'T',
      title: 'Document the 5 transition rule types in /help',
      status: 'todo', priority: 'med', assigneeName: 'Priya Rao',
      labels: ['docs'], estimate: 2,
      startDate: null, endDate: '2026-05-04',
      parentFeKey: 'CMT-232', relatedToFeKeys: [],
      dependsOnFeKeys: ['CMT-234'], description: null,
    },
    {
      feKey: 'CMT-235', projectSlug: 'comet', type: 'B',
      title: 'Self-loop edges render outside node hit area at zoom < 60%',
      status: 'todo', priority: 'low', assigneeName: 'Maya Chen',
      labels: ['workflow'], estimate: 1,
      startDate: null, endDate: null,
      parentFeKey: null, relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    {
      feKey: 'CMT-234', projectSlug: 'comet', type: 'T',
      title: 'Add bulk-edit support for status and assignee on board view',
      status: 'in-progress', priority: 'high', assigneeName: 'Sam Park',
      labels: ['board'], estimate: 5,
      startDate: '2026-04-20', endDate: '2026-05-01',
      parentFeKey: null, relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    // CMT-232 is an Epic; FE sets estimate=21 — Epics don't store estimate
    // on the BE per slice 6 rules. Children are derived (parent_issue_id),
    // so we don't store the children[] list either.
    {
      feKey: 'CMT-232', projectSlug: 'comet', type: 'E',
      title: 'Custom field schema per project',
      status: 'backlog', priority: 'high', assigneeName: 'Jordan Lee',
      labels: ['fields', 'q3'], estimate: null,
      startDate: null, endDate: null,
      parentFeKey: null, relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    // CMT-230 Story; estimate=3 in FE dropped (Story).
    {
      feKey: 'CMT-230', projectSlug: 'comet', type: 'S',
      title: 'Auto-archive Done issues after 30 days',
      status: 'in-review', priority: 'med', assigneeName: 'Sam Park',
      labels: ['retention'], estimate: null,
      startDate: null, endDate: null,
      parentFeKey: 'CMT-232', relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    {
      feKey: 'CMT-229', projectSlug: 'comet', type: 'B',
      title: 'Cycle detection misses A→B→A back-edges in graph linter',
      status: 'in-progress', priority: 'urgent', assigneeName: 'Maya Chen',
      labels: ['workflow'], estimate: 5,
      startDate: '2026-04-24', endDate: '2026-04-28',
      parentFeKey: null, relatedToFeKeys: ['CMT-241'],
      dependsOnFeKeys: [], description: null,
    },
    {
      feKey: 'CMT-227', projectSlug: 'comet', type: 'T',
      title: 'Slug validation on workspace creation',
      status: 'done', priority: 'med', assigneeName: 'Priya Rao',
      labels: ['onboarding'], estimate: 2,
      startDate: '2026-04-21', endDate: '2026-04-25',
      parentFeKey: null, relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    {
      feKey: 'CMT-225', projectSlug: 'comet', type: 'B',
      title: 'Empty state on inbox triggers layout flash on first load',
      status: 'todo', priority: 'low', assigneeName: 'Sam Park',
      labels: ['frontend'], estimate: 2,
      startDate: null, endDate: null,
      parentFeKey: null, relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    // CMT-223 Story; estimate=8 in FE dropped (Story).
    {
      feKey: 'CMT-223', projectSlug: 'comet', type: 'S',
      title: 'Slack-style /commands in comments',
      status: 'backlog', priority: 'med', assigneeName: 'Jordan Lee',
      labels: ['comments'], estimate: null,
      startDate: null, endDate: null,
      parentFeKey: 'CMT-232', relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    {
      feKey: 'CMT-220', projectSlug: 'comet', type: 'T',
      title: 'Export workflow as YAML',
      status: 'backlog', priority: 'low', assigneeName: 'Priya Rao',
      labels: ['workflow'], estimate: 3,
      startDate: null, endDate: null,
      parentFeKey: 'CMT-232', relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },

    // --- Orbit ---
    // ORB-58 Story; estimate=5 in FE dropped (Story).
    {
      feKey: 'ORB-58', projectSlug: 'orbit', type: 'S',
      title: 'Render top-of-funnel chart with project-level filter',
      status: 'in-progress', priority: 'high', assigneeName: 'Jordan Lee',
      labels: ['analytics'], estimate: null,
      startDate: null, endDate: null,
      parentFeKey: 'ORB-40', relatedToFeKeys: ['ORB-55'],
      dependsOnFeKeys: [], description: null,
    },
    {
      feKey: 'ORB-55', projectSlug: 'orbit', type: 'B',
      title: 'Date-range picker drops timezone offset on apply',
      status: 'in-review', priority: 'urgent', assigneeName: 'Riley Singh',
      labels: ['regression', 'analytics'], estimate: 2,
      startDate: '2026-04-25', endDate: '2026-04-28',
      parentFeKey: null, relatedToFeKeys: ['ORB-58'],
      dependsOnFeKeys: [], description: null,
    },
    {
      feKey: 'ORB-52', projectSlug: 'orbit', type: 'T',
      title: 'Add CSV export for cohort table',
      status: 'todo', priority: 'med', assigneeName: 'Jordan Lee',
      labels: ['exports'], estimate: 3,
      startDate: null, endDate: '2026-05-10',
      parentFeKey: 'ORB-58', relatedToFeKeys: [],
      dependsOnFeKeys: ['ORB-32'], description: null,
    },
    {
      feKey: 'ORB-49', projectSlug: 'orbit', type: 'B',
      title: 'Loading spinner persists after error response',
      status: 'todo', priority: 'low', assigneeName: 'Avery Kim',
      labels: ['frontend'], estimate: 1,
      startDate: null, endDate: null,
      parentFeKey: null, relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    // ORB-44 Story; estimate=8 in FE dropped (Story).
    {
      feKey: 'ORB-44', projectSlug: 'orbit', type: 'S',
      title: 'Per-user retention view on dashboard',
      status: 'backlog', priority: 'med', assigneeName: 'Riley Singh',
      labels: ['analytics', 'retention'], estimate: null,
      startDate: null, endDate: null,
      parentFeKey: 'ORB-40', relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    // ORB-40 Epic; estimate=21 in FE dropped (Epic).
    {
      feKey: 'ORB-40', projectSlug: 'orbit', type: 'E',
      title: 'Cohort analysis revamp',
      status: 'backlog', priority: 'high', assigneeName: 'Jordan Lee',
      labels: ['q3', 'analytics'], estimate: null,
      startDate: null, endDate: null,
      parentFeKey: null, relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    {
      feKey: 'ORB-32', projectSlug: 'orbit', type: 'T',
      title: 'Tighten type-safety on event schema',
      status: 'done', priority: 'low', assigneeName: 'Sam Park',
      labels: ['refactor'], estimate: 2,
      startDate: '2026-04-17', endDate: '2026-04-24',
      parentFeKey: 'ORB-40', relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },

    // --- Atlas ---
    {
      feKey: 'ATL-136', projectSlug: 'atlas', type: 'T',
      title: 'QA pass on device farm against new tile format',
      status: 'backlog', priority: 'med', assigneeName: 'Sam Park',
      labels: ['qa', 'offline'], estimate: 4,
      startDate: '2026-05-15', endDate: '2026-05-18',
      parentFeKey: 'ATL-130', relatedToFeKeys: [],
      dependsOnFeKeys: ['ATL-135'], description: null,
    },
    {
      feKey: 'ATL-135', projectSlug: 'atlas', type: 'T',
      title: 'Add compaction metrics + Grafana panels',
      status: 'backlog', priority: 'med', assigneeName: 'Avery Kim',
      labels: ['observability'], estimate: 6,
      startDate: '2026-05-12', endDate: '2026-05-14',
      parentFeKey: 'ATL-130', relatedToFeKeys: [],
      dependsOnFeKeys: ['ATL-133', 'ATL-134'], description: null,
    },
    {
      feKey: 'ATL-134', projectSlug: 'atlas', type: 'T',
      title: 'Update tile reader to handle compacted format',
      status: 'backlog', priority: 'high', assigneeName: 'Priya Rao',
      labels: ['offline', 'reader'], estimate: 8,
      startDate: '2026-05-07', endDate: '2026-05-11',
      parentFeKey: 'ATL-130', relatedToFeKeys: [],
      dependsOnFeKeys: ['ATL-132'], description: null,
    },
    {
      feKey: 'ATL-133', projectSlug: 'atlas', type: 'T',
      title: 'Migrate stored tiles to compacted format in place',
      status: 'backlog', priority: 'high', assigneeName: 'Maya Chen',
      labels: ['offline', 'migration'], estimate: 8,
      startDate: '2026-05-07', endDate: '2026-05-11',
      parentFeKey: 'ATL-130', relatedToFeKeys: [],
      dependsOnFeKeys: ['ATL-132'], description: null,
    },
    {
      feKey: 'ATL-132', projectSlug: 'atlas', type: 'T',
      title: 'Implement compaction algorithm',
      status: 'backlog', priority: 'high', assigneeName: 'Maya Chen',
      labels: ['offline'], estimate: 12,
      startDate: '2026-05-04', endDate: '2026-05-06',
      parentFeKey: 'ATL-130', relatedToFeKeys: [],
      dependsOnFeKeys: ['ATL-131'], description: null,
    },
    {
      feKey: 'ATL-131', projectSlug: 'atlas', type: 'T',
      title: 'Audit current cache schema and pick compaction target',
      status: 'in-progress', priority: 'high', assigneeName: 'Maya Chen',
      labels: ['offline', 'spike'], estimate: 4,
      startDate: '2026-04-29', endDate: '2026-04-30',
      parentFeKey: 'ATL-130', relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    // ATL-130 Epic; estimate=42 in FE dropped (Epic).
    {
      feKey: 'ATL-130', projectSlug: 'atlas', type: 'E',
      title: 'Offline tile compaction',
      status: 'in-progress', priority: 'high', assigneeName: 'Maya Chen',
      labels: ['offline', 'q2'], estimate: null,
      startDate: null, endDate: null,
      parentFeKey: null, relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    {
      feKey: 'ATL-119', projectSlug: 'atlas', type: 'B',
      title: 'Tile prefetch corrupts cache index on simultaneous writes',
      status: 'in-progress', priority: 'urgent', assigneeName: 'Maya Chen',
      labels: ['offline', 'regression'], estimate: 6,
      startDate: '2026-04-29', endDate: '2026-04-30',
      parentFeKey: null, relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    {
      feKey: 'ATL-118', projectSlug: 'atlas', type: 'B',
      title: 'Map tiles fail to load when offline cache is full',
      status: 'in-progress', priority: 'urgent', assigneeName: 'Maya Chen',
      labels: ['offline', 'map'], estimate: 5,
      startDate: '2026-04-26', endDate: '2026-04-30',
      parentFeKey: null, relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    // ATL-115 Story; estimate=3 in FE dropped (Story).
    {
      feKey: 'ATL-115', projectSlug: 'atlas', type: 'S',
      title: 'Pinch-zoom acceleration curve on mobile',
      status: 'in-review', priority: 'med', assigneeName: 'Jordan Lee',
      labels: ['mobile', 'map'], estimate: null,
      startDate: null, endDate: null,
      parentFeKey: 'ATL-100', relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    {
      feKey: 'ATL-112', projectSlug: 'atlas', type: 'T',
      title: 'Migrate icon set to Lucide v2',
      status: 'todo', priority: 'low', assigneeName: 'Priya Rao',
      labels: ['frontend'], estimate: 2,
      startDate: null, endDate: '2026-05-15',
      parentFeKey: null, relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    // ATL-110 Story; estimate=5 in FE dropped (Story).
    {
      feKey: 'ATL-110', projectSlug: 'atlas', type: 'S',
      title: 'Cluster overlay markers above zoom 14',
      status: 'todo', priority: 'high', assigneeName: 'Jordan Lee',
      labels: ['map'], estimate: null,
      startDate: null, endDate: null,
      parentFeKey: 'ATL-100', relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    {
      feKey: 'ATL-104', projectSlug: 'atlas', type: 'B',
      title: 'GPX import drops elevation column',
      status: 'backlog', priority: 'med', assigneeName: 'Avery Kim',
      labels: ['imports'], estimate: 3,
      startDate: null, endDate: null,
      parentFeKey: null, relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    // ATL-100 Epic; estimate=34 in FE dropped (Epic).
    {
      feKey: 'ATL-100', projectSlug: 'atlas', type: 'E',
      title: 'Real-time location sharing for teams',
      status: 'backlog', priority: 'high', assigneeName: 'Maya Chen',
      labels: ['q4', 'collaboration'], estimate: null,
      startDate: null, endDate: null,
      parentFeKey: null, relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
    {
      feKey: 'ATL-98', projectSlug: 'atlas', type: 'T',
      title: 'Tile server health check endpoint',
      status: 'done', priority: 'med', assigneeName: 'Sam Park',
      labels: ['ops'], estimate: 2,
      startDate: '2026-04-14', endDate: '2026-04-21',
      parentFeKey: null, relatedToFeKeys: [],
      dependsOnFeKeys: [], description: null,
    },
  ];

  // Resolve assignee name -> userId, defaulting to Jordan when unknown.
  const reporterUserId = idFor('jordan@acme.com');
  const resolveAssignee = (name: string): string => {
    const email = assigneeNameToEmail[name];
    if (!email) {
      // eslint-disable-next-line no-console
      console.warn(`Seed: unknown fixture assignee '${name}', defaulting to jordan@acme.com`);
      return reporterUserId;
    }
    return idFor(email);
  };

  // Pass 1: insert issues with parent_issue_id null. Parse seq from feKey.
  const issueInsertRows = issueSeeds.map((s) => {
    const dashIdx = s.feKey.lastIndexOf('-');
    const seq = Number(s.feKey.slice(dashIdx + 1));
    if (!Number.isFinite(seq)) {
      throw new Error(`Seed: invalid issue key '${s.feKey}'`);
    }
    return {
      workspaceId: acmeWorkspaceId,
      projectId: projectIdFor(s.projectSlug),
      key: s.feKey,
      seq,
      type: s.type,
      status: s.status,
      priority: s.priority,
      title: s.title,
      description: s.description,
      labels: s.labels,
      assigneeUserId: resolveAssignee(s.assigneeName),
      reporterUserId,
      parentIssueId: null,
      startDate: s.startDate,
      endDate: s.endDate,
      estimate: s.estimate,
    };
  });

  const insertedIssueRows = (await knex('issues')
    .insert(issueInsertRows)
    .returning(['id', 'key'])) as Array<{ id: string; key: string }>;

  const issueIdByFeKey = new Map(insertedIssueRows.map((r) => [r.key, r.id]));
  const issueIdFor = (feKey: string): string => {
    const id = issueIdByFeKey.get(feKey);
    if (!id) throw new Error(`Seed: issue id for ${feKey} not found`);
    return id;
  };

  // Pass 2: backfill parent_issue_id for issues that have one. One UPDATE per
  // child keeps the seed obvious; volume is tiny.
  for (const s of issueSeeds) {
    if (!s.parentFeKey) continue;
    const childId = issueIdFor(s.feKey);
    const parentId = issueIdFor(s.parentFeKey);
    await knex('issues').where('id', childId).update({
      parentIssueId: parentId,
      updatedAt: knex.fn.now(),
    });
  }

  // ── Bump projects.next_issue_number past the highest seeded seq ─────
  // So future API-created issues continue from the right number per project.
  const maxSeqBySlug = new Map<string, number>();
  for (const s of issueSeeds) {
    const dashIdx = s.feKey.lastIndexOf('-');
    const seq = Number(s.feKey.slice(dashIdx + 1));
    const cur = maxSeqBySlug.get(s.projectSlug) ?? 0;
    if (seq > cur) maxSeqBySlug.set(s.projectSlug, seq);
  }
  for (const [slug, maxSeq] of maxSeqBySlug) {
    await knex('projects').where('id', projectIdFor(slug)).update({
      nextIssueNumber: maxSeq + 1,
      updatedAt: knex.fn.now(),
    });
  }

  // ── Issue relates (canonicalised, deduped) ──────────────────────────
  const seenRelates = new Set<string>();
  const relatesInserts: Array<{ aId: string; bId: string }> = [];
  for (const s of issueSeeds) {
    for (const otherFeKey of s.relatedToFeKeys) {
      const aId = issueIdFor(s.feKey);
      const bId = issueIdFor(otherFeKey);
      // Canonicalise: smaller uuid first to satisfy issue_relates_canonical_chk.
      const [lo, hi] = aId < bId ? [aId, bId] : [bId, aId];
      const key = `${lo}|${hi}`;
      if (seenRelates.has(key)) continue;
      seenRelates.add(key);
      relatesInserts.push({ aId: lo, bId: hi });
    }
  }
  if (relatesInserts.length > 0) {
    await knex('issue_relates').insert(relatesInserts);
  }

  // ── Issue dependencies (directed, deduped) ──────────────────────────
  // The FE stores both dependsOn and dependedOnBy. Walk only `dependsOn` —
  // that side already covers every directed edge exactly once.
  const seenDeps = new Set<string>();
  const depInserts: Array<{ blockerId: string; dependentId: string }> = [];
  for (const s of issueSeeds) {
    const dependentId = issueIdFor(s.feKey);
    for (const blockerFeKey of s.dependsOnFeKeys) {
      const blockerId = issueIdFor(blockerFeKey);
      if (blockerId === dependentId) continue;
      const key = `${blockerId}|${dependentId}`;
      if (seenDeps.has(key)) continue;
      seenDeps.add(key);
      depInserts.push({ blockerId, dependentId });
    }
  }
  if (depInserts.length > 0) {
    await knex('issue_dependencies').insert(depInserts);
  }

  const ruleCountRow = (await knex('workflow_transition_rules').count<{ count: string }>('id as count').first()) as { count: string } | undefined;
  const ruleCount = Number(ruleCountRow?.count ?? 0);

  // eslint-disable-next-line no-console
  console.log(
    [
      'Seeded:',
      '  2 tenants (dreamstreet [intentionally workflow-less], acme-corp)',
      '  3 workspaces, 3 projects, 3 workflows, 8 users:',
      '    admin@dreamstreet.io / password123        (dreamstreet admin)',
      '    jordan@acme.com      / password123        (acme admin)',
      '    sam@acme.com         / password123        (acme admin)',
      '    morgan@acme.com      / password123        (acme write)',
      '    riley@acme.com       / temp-riley-1234    (acme write, mustResetPassword=true)',
      '    maya@acme.com        / password123        (acme write)',
      '    priya@acme.com       / password123        (acme write)',
      '    avery@acme.com       / password123        (acme read)',
      `  ${issueInsertRows.length} issues,`,
      `  ${relatesInserts.length} relates / ${depInserts.length} depends-on links,`,
      `  ${ruleCount} transition rules.`,
    ].join('\n')
  );
}
