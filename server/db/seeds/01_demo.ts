import type { Knex } from 'knex';
import { hashPassword } from '../../src/lib/passwordUtils.js';

/**
 * Seed:
 *   1. DreamStreet — primary tenant. Carries 13 users (2 tenant admins +
 *      11 other tenant members) and a `test-workspace` workspace with a
 *      `playground` project, default workflow, and a board's worth of
 *      dummy issues. Every active dreamstreet user has an *explicit*
 *      workspace_memberships row in test-workspace so they're addable to
 *      teams — implicit (tenant-admin-only) members can't join teams,
 *      see `services/teamService.ts → addMember`. The `noWorkflow`
 *      permissive fallback in `evaluateTransition` is still testable by
 *      clearing `project_workflows` for any (project, issueType) pair
 *      after seeding.
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
        email: 'alex@dreamstreet.io',
        passwordHash: standardPasswordHash,
        firstName: 'Alex',
        lastName: 'Morgan',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'taylor@dreamstreet.io',
        passwordHash: standardPasswordHash,
        firstName: 'Taylor',
        lastName: 'Quinn',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'jamie@dreamstreet.io',
        passwordHash: standardPasswordHash,
        firstName: 'Jamie',
        lastName: 'Reed',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'casey@dreamstreet.io',
        passwordHash: standardPasswordHash,
        firstName: 'Casey',
        lastName: 'Park',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'robin@dreamstreet.io',
        passwordHash: standardPasswordHash,
        firstName: 'Robin',
        lastName: 'Cole',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'elena@dreamstreet.io',
        passwordHash: standardPasswordHash,
        firstName: 'Elena',
        lastName: 'Sokolov',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'noah@dreamstreet.io',
        passwordHash: standardPasswordHash,
        firstName: 'Noah',
        lastName: 'Park',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'sage@dreamstreet.io',
        passwordHash: standardPasswordHash,
        firstName: 'Sage',
        lastName: 'Carter',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'harper@dreamstreet.io',
        passwordHash: standardPasswordHash,
        firstName: 'Harper',
        lastName: 'Diaz',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'omar@dreamstreet.io',
        passwordHash: standardPasswordHash,
        firstName: 'Omar',
        lastName: 'Hassan',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'mei@dreamstreet.io',
        passwordHash: standardPasswordHash,
        firstName: 'Mei',
        lastName: 'Lin',
        phone: null,
        isActive: true,
        mustResetPassword: false,
      },
      {
        email: 'kiran@dreamstreet.io',
        passwordHash: standardPasswordHash,
        firstName: 'Kiran',
        lastName: 'Bhat',
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
    { userId: idFor('alex@dreamstreet.io'), tenantId: dreamStreetId, role: 'admin', status: 'active' },
    { userId: idFor('taylor@dreamstreet.io'), tenantId: dreamStreetId, role: 'write', status: 'active' },
    { userId: idFor('jamie@dreamstreet.io'), tenantId: dreamStreetId, role: 'write', status: 'active' },
    { userId: idFor('casey@dreamstreet.io'), tenantId: dreamStreetId, role: 'write', status: 'active' },
    { userId: idFor('robin@dreamstreet.io'), tenantId: dreamStreetId, role: 'read', status: 'active' },
    { userId: idFor('elena@dreamstreet.io'), tenantId: dreamStreetId, role: 'write', status: 'active' },
    { userId: idFor('noah@dreamstreet.io'), tenantId: dreamStreetId, role: 'write', status: 'active' },
    { userId: idFor('sage@dreamstreet.io'), tenantId: dreamStreetId, role: 'write', status: 'active' },
    { userId: idFor('harper@dreamstreet.io'), tenantId: dreamStreetId, role: 'read', status: 'active' },
    { userId: idFor('omar@dreamstreet.io'), tenantId: dreamStreetId, role: 'write', status: 'active' },
    { userId: idFor('mei@dreamstreet.io'), tenantId: dreamStreetId, role: 'write', status: 'active' },
    { userId: idFor('kiran@dreamstreet.io'), tenantId: dreamStreetId, role: 'read', status: 'active' },
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
  // Mirrors `WORKFLOWS` in web/src/fixtures.ts. Three definitions:
  // `default` (six-state with reopen + request-changes back-edges),
  // `epic-coarse` (three-state), `epic-detailed` (five-state w/ review).
  const workflowDefs = [
    {
      slug: 'default',
      name: 'Default',
      description:
        'The standard six-state flow with reopen and request-changes back-edges. Used by Task, Bug, and Story by default.',
      nodes: [
        { key: 'n1', statusId: 'backlog', x: 40, y: 240, isInitial: true, isTerminal: false },
        { key: 'n2', statusId: 'todo', x: 220, y: 240, isInitial: false, isTerminal: false },
        { key: 'n3', statusId: 'in-progress', x: 400, y: 160, isInitial: false, isTerminal: false },
        { key: 'n4', statusId: 'in-review', x: 580, y: 160, isInitial: false, isTerminal: false },
        { key: 'n5', statusId: 'done', x: 760, y: 240, isInitial: false, isTerminal: true },
        { key: 'n6', statusId: 'canceled', x: 400, y: 380, isInitial: false, isTerminal: true },
      ],
      edges: [
        { fromKey: 'n1', toKey: 'n2', label: null, dashed: false },
        { fromKey: 'n2', toKey: 'n3', label: null, dashed: false },
        { fromKey: 'n3', toKey: 'n4', label: 'PR opened', dashed: false },
        { fromKey: 'n4', toKey: 'n5', label: 'approve', dashed: true },
        { fromKey: 'n4', toKey: 'n3', label: 'request changes', dashed: false },
        { fromKey: 'n3', toKey: 'n2', label: null, dashed: false },
        { fromKey: 'n2', toKey: 'n6', label: null, dashed: false },
        { fromKey: 'n3', toKey: 'n6', label: null, dashed: false },
        { fromKey: 'n5', toKey: 'n2', label: 'reopen', dashed: true },
      ],
    },
    {
      slug: 'epic-coarse',
      name: 'Coarse',
      description:
        'Three-state flow for tracking epics loosely. No review phase; back-edge for reopen.',
      nodes: [
        { key: 'n1', statusId: 'todo', x: 100, y: 220, isInitial: true, isTerminal: false },
        { key: 'n2', statusId: 'in-progress', x: 360, y: 220, isInitial: false, isTerminal: false },
        { key: 'n3', statusId: 'done', x: 620, y: 220, isInitial: false, isTerminal: true },
      ],
      edges: [
        { fromKey: 'n1', toKey: 'n2', label: 'start', dashed: false },
        { fromKey: 'n2', toKey: 'n3', label: 'finish', dashed: false },
        { fromKey: 'n3', toKey: 'n2', label: 'reopen', dashed: true },
      ],
    },
    {
      slug: 'epic-detailed',
      name: 'Detailed (with spec & review)',
      description:
        'Five-state flow for epics that go through a spec phase and require review before close.',
      nodes: [
        { key: 'n1', statusId: 'backlog', x: 40, y: 240, isInitial: true, isTerminal: false },
        { key: 'n2', statusId: 'todo', x: 220, y: 240, isInitial: false, isTerminal: false },
        { key: 'n3', statusId: 'in-progress', x: 400, y: 240, isInitial: false, isTerminal: false },
        { key: 'n4', statusId: 'in-review', x: 580, y: 240, isInitial: false, isTerminal: false },
        { key: 'n5', statusId: 'done', x: 760, y: 240, isInitial: false, isTerminal: true },
      ],
      edges: [
        { fromKey: 'n1', toKey: 'n2', label: 'spec', dashed: false },
        { fromKey: 'n2', toKey: 'n3', label: 'start', dashed: false },
        { fromKey: 'n3', toKey: 'n4', label: 'submit for review', dashed: false },
        { fromKey: 'n4', toKey: 'n3', label: 'request changes', dashed: false },
        { fromKey: 'n4', toKey: 'n5', label: 'approve', dashed: true },
        { fromKey: 'n5', toKey: 'n3', label: 'reopen', dashed: true },
      ],
    },
  ];

  const workflowRows = (await knex('workflows')
    .insert(
      workflowDefs.map((w) => ({
        workspaceId: acmeWorkspaceId,
        slug: w.slug,
        name: w.name,
        description: w.description,
      }))
    )
    .returning(['id', 'slug'])) as Array<{ id: string; slug: string }>;

  const workflowIdBySlug = new Map(workflowRows.map((w) => [w.slug, w.id]));

  // Insert nodes per workflow and remember the (workflowSlug, nodeKey) -> id
  // mapping so we can wire up transitions next.
  const nodeIdByWorkflowAndKey = new Map<string, string>();
  for (const def of workflowDefs) {
    const workflowId = workflowIdBySlug.get(def.slug)!;
    const nodeRows = (await knex('workflow_nodes')
      .insert(
        def.nodes.map((n) => ({
          workflowId,
          statusId: n.statusId,
          x: n.x,
          y: n.y,
          isInitial: n.isInitial,
          isTerminal: n.isTerminal,
        }))
      )
      .returning(['id', 'statusId'])) as Array<{ id: string; statusId: string }>;

    // Map back to the fixture's `nKEY` ids by reading nodes in insert order.
    def.nodes.forEach((n, i) => {
      const inserted = nodeRows[i];
      if (!inserted) throw new Error(`Seed: workflow_node insert mismatch for ${def.slug}/${n.key}`);
      nodeIdByWorkflowAndKey.set(`${def.slug}:${n.key}`, inserted.id);
    });
  }

  // Insert transitions; track ids so we can attach rules.
  const transitionId = new Map<string, string>(); // `${workflowSlug}:${fromKey}->${toKey}` -> id
  for (const def of workflowDefs) {
    const workflowId = workflowIdBySlug.get(def.slug)!;
    const transitionInserts = def.edges.map((e) => ({
      workflowId,
      fromNodeId: nodeIdByWorkflowAndKey.get(`${def.slug}:${e.fromKey}`)!,
      toNodeId: nodeIdByWorkflowAndKey.get(`${def.slug}:${e.toKey}`)!,
      label: e.label,
      dashed: e.dashed,
    }));
    const inserted = (await knex('workflow_transitions')
      .insert(transitionInserts)
      .returning(['id', 'fromNodeId', 'toNodeId'])) as Array<{
      id: string;
      fromNodeId: string;
      toNodeId: string;
    }>;
    def.edges.forEach((e, i) => {
      const row = inserted[i];
      if (!row) throw new Error(`Seed: workflow_transition insert mismatch for ${def.slug}`);
      transitionId.set(`${def.slug}:${e.fromKey}->${e.toKey}`, row.id);
    });
  }

  // ── Transition rules ────────────────────────────────────────────────
  // The FE fixtures store node-level rule *counts* only (UI hint), so we
  // hand-pick a small set that demonstrates each of the five rule types.
  // These are the rules listed in the seed-expansion task spec.
  const ruleInserts: Array<{
    transitionId: string;
    type: string;
    params: object | null;
  }> = [];

  const addRule = (
    workflowSlug: string,
    fromKey: string,
    toKey: string,
    type: string,
    params: object | null
  ) => {
    const tid = transitionId.get(`${workflowSlug}:${fromKey}->${toKey}`);
    if (!tid) {
      throw new Error(`Seed: transition ${workflowSlug}:${fromKey}->${toKey} not found for rule`);
    }
    ruleInserts.push({ transitionId: tid, type, params });
  };

  // default: todo -> in-progress requires the issue to be assigned.
  addRule('default', 'n2', 'n3', 'assignee_only', null);
  // default: in-progress -> in-review requires estimate + assignee set.
  addRule('default', 'n3', 'n4', 'required_fields', { fields: ['estimate', 'assignee'] });
  // default: in-review -> done requires write+ AND not the reporter.
  addRule('default', 'n4', 'n5', 'role', { role: 'write' });
  addRule('default', 'n4', 'n5', 'not_self', null);
  // epic-detailed: in-review -> done requires admin.
  addRule('epic-detailed', 'n4', 'n5', 'role', { role: 'admin' });

  // jsonb columns need stringification with knex when inserting via plain JS
  // objects. knex-stringcase doesn't touch the column value itself; pg accepts
  // JSON either way but stringifying makes the intent explicit.
  await knex('workflow_transition_rules').insert(
    ruleInserts.map((r) => ({
      transitionId: r.transitionId,
      type: r.type,
      params: r.params === null ? null : JSON.stringify(r.params),
    }))
  );

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

  // ── DreamStreet: test-workspace + playground project ────────────────
  // Mirror of the acme block above, scoped down: one workspace, one
  // project, one default workflow, no transition rules, no issue links —
  // just enough to render a populated board and exercise the team / member
  // flows. Every active dreamstreet user gets an explicit
  // workspace_memberships row (admins are explicit too, even though
  // tenant-admin already gives them implicit access — explicit rows are
  // what `teamService.addMember` requires).
  const dsWorkspace = (await knex('workspaces')
    .insert({
      tenantId: dreamStreetId,
      slug: 'test-workspace',
      name: 'Test Workspace',
      letter: 'T',
      color: '#4f46e5',
      bg: '#e0e7ff',
    })
    .returning(['id', 'slug'])) as Array<{ id: string; slug: string }>;
  const dsWorkspaceId = dsWorkspace[0]!.id;

  // Explicit workspace memberships — keep the admin/write/read mix from
  // tenant memberships so RBAC scenarios are exercisable.
  const dsMembershipsSeed: Array<{ email: string; role: 'admin' | 'write' | 'read' }> = [
    { email: 'admin@dreamstreet.io', role: 'admin' },
    { email: 'alex@dreamstreet.io', role: 'admin' },
    { email: 'taylor@dreamstreet.io', role: 'write' },
    { email: 'jamie@dreamstreet.io', role: 'write' },
    { email: 'casey@dreamstreet.io', role: 'write' },
    { email: 'robin@dreamstreet.io', role: 'read' },
    { email: 'elena@dreamstreet.io', role: 'write' },
    { email: 'noah@dreamstreet.io', role: 'write' },
    { email: 'sage@dreamstreet.io', role: 'write' },
    { email: 'harper@dreamstreet.io', role: 'read' },
    { email: 'omar@dreamstreet.io', role: 'write' },
    { email: 'mei@dreamstreet.io', role: 'write' },
    { email: 'kiran@dreamstreet.io', role: 'read' },
  ];
  await knex('workspace_memberships').insert(
    dsMembershipsSeed.map((m) => ({
      userId: idFor(m.email),
      workspaceId: dsWorkspaceId,
      role: m.role,
      status: 'active',
    }))
  );

  // Project.
  const dsAdminId = idFor('admin@dreamstreet.io');
  const dsProjectRow = (await knex('projects')
    .insert({
      workspaceId: dsWorkspaceId,
      slug: 'playground',
      key: 'PLG',
      name: 'Playground',
      letter: 'P',
      color: '#9333ea',
      bg: '#f3e8ff',
      description: 'Sandbox project for poking at the FE — populated with dummy issues across statuses.',
      status: 'active',
      createdByUserId: dsAdminId,
    })
    .returning(['id'])) as Array<{ id: string }>;
  const dsProjectId = dsProjectRow[0]!.id;

  // Default workflow — the same six-state shape as Acme's `default`. Inlined
  // here rather than DRY-ed with the acme block above because the workflow
  // table is workspace-scoped and the slugs are independent.
  const dsWorkflowRow = (await knex('workflows')
    .insert({
      workspaceId: dsWorkspaceId,
      slug: 'default',
      name: 'Default',
      description: 'Six-state flow with reopen and request-changes back-edges.',
    })
    .returning(['id'])) as Array<{ id: string }>;
  const dsWorkflowId = dsWorkflowRow[0]!.id;

  const dsNodeDefs = [
    { key: 'n1', statusId: 'backlog', x: 40, y: 240, isInitial: true, isTerminal: false },
    { key: 'n2', statusId: 'todo', x: 220, y: 240, isInitial: false, isTerminal: false },
    { key: 'n3', statusId: 'in-progress', x: 400, y: 160, isInitial: false, isTerminal: false },
    { key: 'n4', statusId: 'in-review', x: 580, y: 160, isInitial: false, isTerminal: false },
    { key: 'n5', statusId: 'done', x: 760, y: 240, isInitial: false, isTerminal: true },
    { key: 'n6', statusId: 'canceled', x: 400, y: 380, isInitial: false, isTerminal: true },
  ];
  const dsNodeRows = (await knex('workflow_nodes')
    .insert(dsNodeDefs.map((n) => ({
      workflowId: dsWorkflowId,
      statusId: n.statusId,
      x: n.x,
      y: n.y,
      isInitial: n.isInitial,
      isTerminal: n.isTerminal,
    })))
    .returning(['id', 'statusId'])) as Array<{ id: string; statusId: string }>;
  const dsNodeIdByKey = new Map<string, string>();
  dsNodeDefs.forEach((n, i) => {
    dsNodeIdByKey.set(n.key, dsNodeRows[i]!.id);
  });

  const dsEdgeDefs = [
    { fromKey: 'n1', toKey: 'n2', label: null, dashed: false },
    { fromKey: 'n2', toKey: 'n3', label: null, dashed: false },
    { fromKey: 'n3', toKey: 'n4', label: 'PR opened', dashed: false },
    { fromKey: 'n4', toKey: 'n5', label: 'approve', dashed: true },
    { fromKey: 'n4', toKey: 'n3', label: 'request changes', dashed: false },
    { fromKey: 'n3', toKey: 'n2', label: null, dashed: false },
    { fromKey: 'n2', toKey: 'n6', label: null, dashed: false },
    { fromKey: 'n3', toKey: 'n6', label: null, dashed: false },
    { fromKey: 'n5', toKey: 'n2', label: 'reopen', dashed: true },
  ];
  await knex('workflow_transitions').insert(
    dsEdgeDefs.map((e) => ({
      workflowId: dsWorkflowId,
      fromNodeId: dsNodeIdByKey.get(e.fromKey)!,
      toNodeId: dsNodeIdByKey.get(e.toKey)!,
      label: e.label,
      dashed: e.dashed,
    }))
  );

  // Assign the default workflow to all four issue types on playground.
  await knex('project_workflows').insert(
    (['T', 'B', 'S', 'E'] as const).map((issueType) => ({
      projectId: dsProjectId,
      issueType,
      workflowId: dsWorkflowId,
    }))
  );

  // Dummy issues — at least one in every status so the board renders all
  // columns populated. Reporter is the workspace admin; assignees rotate
  // across the dreamstreet roster. No parent links / relates / depends-on
  // — keep this surface simple, the acme set above already exercises that.
  type DsIssueSeed = {
    seq: number;
    type: 'T' | 'B' | 'S' | 'E';
    title: string;
    status: 'backlog' | 'todo' | 'in-progress' | 'in-review' | 'done' | 'canceled';
    priority: 'urgent' | 'high' | 'med' | 'low' | 'none';
    assigneeEmail: string;
    labels: string[];
    estimate: number | null;
  };
  const dsIssueSeeds: DsIssueSeed[] = [
    // backlog
    { seq: 1, type: 'T', title: 'Spike: pick a charting library for the dashboard', status: 'backlog', priority: 'med', assigneeEmail: 'taylor@dreamstreet.io', labels: ['spike', 'frontend'], estimate: 3 },
    { seq: 2, type: 'B', title: 'Sidebar collapse animation stutters on Safari', status: 'backlog', priority: 'low', assigneeEmail: 'noah@dreamstreet.io', labels: ['frontend'], estimate: 2 },
    { seq: 3, type: 'T', title: 'Wire up structured logs to log aggregator', status: 'backlog', priority: 'high', assigneeEmail: 'omar@dreamstreet.io', labels: ['observability'], estimate: 5 },
    // todo
    { seq: 4, type: 'T', title: 'Add E2E test for the login → workspace redirect', status: 'todo', priority: 'med', assigneeEmail: 'elena@dreamstreet.io', labels: ['testing'], estimate: 3 },
    { seq: 5, type: 'B', title: 'Empty state on Inbox shifts vertically on first paint', status: 'todo', priority: 'low', assigneeEmail: 'sage@dreamstreet.io', labels: ['frontend'], estimate: 1 },
    { seq: 6, type: 'T', title: 'Document the workflow editor keyboard shortcuts', status: 'todo', priority: 'low', assigneeEmail: 'mei@dreamstreet.io', labels: ['docs'], estimate: 2 },
    // in-progress
    { seq: 7, type: 'T', title: 'Implement bulk-edit menu on the board', status: 'in-progress', priority: 'high', assigneeEmail: 'jamie@dreamstreet.io', labels: ['board'], estimate: 5 },
    { seq: 8, type: 'B', title: 'Tile prefetch fires twice on slow networks', status: 'in-progress', priority: 'urgent', assigneeEmail: 'casey@dreamstreet.io', labels: ['regression'], estimate: 4 },
    { seq: 9, type: 'T', title: 'Migrate icon set to inline SVG', status: 'in-progress', priority: 'med', assigneeEmail: 'noah@dreamstreet.io', labels: ['frontend'], estimate: 3 },
    // in-review
    { seq: 10, type: 'T', title: 'Persist column layout per-user in localStorage', status: 'in-review', priority: 'med', assigneeEmail: 'taylor@dreamstreet.io', labels: ['frontend'], estimate: 2 },
    { seq: 11, type: 'B', title: 'Composer drops focus when opening mention picker', status: 'in-review', priority: 'high', assigneeEmail: 'elena@dreamstreet.io', labels: ['comments', 'regression'], estimate: 2 },
    // done
    { seq: 12, type: 'T', title: 'Set up CI pipeline for the web app', status: 'done', priority: 'high', assigneeEmail: 'omar@dreamstreet.io', labels: ['ops'], estimate: 4 },
    { seq: 13, type: 'T', title: 'Add JWT refresh-token rotation', status: 'done', priority: 'urgent', assigneeEmail: 'jamie@dreamstreet.io', labels: ['auth'], estimate: 5 },
    // canceled
    { seq: 14, type: 'B', title: 'Investigate flaky tile-cache test (could not repro)', status: 'canceled', priority: 'low', assigneeEmail: 'casey@dreamstreet.io', labels: ['testing'], estimate: 1 },
  ];

  await knex('issues').insert(
    dsIssueSeeds.map((s) => ({
      workspaceId: dsWorkspaceId,
      projectId: dsProjectId,
      key: `PLG-${s.seq}`,
      seq: s.seq,
      type: s.type,
      status: s.status,
      priority: s.priority,
      title: s.title,
      description: null,
      labels: s.labels,
      assigneeUserId: idFor(s.assigneeEmail),
      reporterUserId: dsAdminId,
      parentIssueId: null,
      startDate: null,
      endDate: null,
      estimate: s.estimate,
    }))
  );

  // Bump nextIssueNumber past the highest seeded seq for playground.
  const dsMaxSeq = dsIssueSeeds.reduce((m, s) => (s.seq > m ? s.seq : m), 0);
  await knex('projects').where('id', dsProjectId).update({
    nextIssueNumber: dsMaxSeq + 1,
    updatedAt: knex.fn.now(),
  });

  // eslint-disable-next-line no-console
  console.log(
    [
      'Seeded:',
      '  2 tenants (dreamstreet, acme-corp)',
      '  4 workspaces, 4 projects, 4 workflows, 20 users:',
      '    admin@dreamstreet.io   / password123        (dreamstreet admin)',
      '    alex@dreamstreet.io    / password123        (dreamstreet admin)',
      '    taylor@dreamstreet.io  / password123        (dreamstreet write)',
      '    jamie@dreamstreet.io   / password123        (dreamstreet write)',
      '    casey@dreamstreet.io   / password123        (dreamstreet write)',
      '    robin@dreamstreet.io   / password123        (dreamstreet read)',
      '    elena@dreamstreet.io   / password123        (dreamstreet write)',
      '    noah@dreamstreet.io    / password123        (dreamstreet write)',
      '    sage@dreamstreet.io    / password123        (dreamstreet write)',
      '    harper@dreamstreet.io  / password123        (dreamstreet read)',
      '    omar@dreamstreet.io    / password123        (dreamstreet write)',
      '    mei@dreamstreet.io     / password123        (dreamstreet write)',
      '    kiran@dreamstreet.io   / password123        (dreamstreet read)',
      '    jordan@acme.com        / password123        (acme admin)',
      '    sam@acme.com           / password123        (acme admin)',
      '    morgan@acme.com        / password123        (acme write)',
      '    riley@acme.com         / temp-riley-1234    (acme write, mustResetPassword=true)',
      '    maya@acme.com          / password123        (acme write)',
      '    priya@acme.com         / password123        (acme write)',
      '    avery@acme.com         / password123        (acme read)',
      `  ${issueInsertRows.length + dsIssueSeeds.length} issues (acme: ${issueInsertRows.length}, dreamstreet: ${dsIssueSeeds.length}),`,
      `  ${relatesInserts.length} relates / ${depInserts.length} depends-on links,`,
      `  ${ruleInserts.length} transition rules.`,
    ].join('\n')
  );
}
