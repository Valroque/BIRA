// Default workflow templates seeded into every newly-created workspace.
//
// A fresh workspace ships with three workflows so that projects created
// inside it have something to fall back to per `getProjectWorkflows.ts`:
//   T / B / S → 'default'   (six-state with reopen + request-changes back-edges)
//   E         → 'epic-coarse' (loose three-state for epics)
// 'epic-detailed' ships too as a richer alternative the user can switch
// individual (project, issue_type) pairs to without authoring one from
// scratch.
//
// Mirrors `WORKFLOWS` in `web/src/fixtures.ts` and the rules previously
// inlined in the demo seed (`db/seeds/01_demo.ts`). The seed and
// `createWorkspace` both consume this same source so any tweak lands in
// one place.
//
// Atomicity: `seedDefaultWorkflowsForWorkspace` requires a transaction
// from the caller and performs every insert (workflows + nodes +
// transitions + rules) on that transaction — if any step throws, the
// caller can roll back the workspace insert with it.
//
// Relevant constants and validation contracts live alongside their
// entities; the seed only carries shapes that already pass those rules.

import type { Knex } from 'knex';
import * as workflowService from '../services/workflowService.js';
import type { StatusId, Role } from './constants.js';
import type { RuleType } from '../entities/WorkflowTransitionRule.js';

interface NodeSeed {
  key: string;
  statusId: StatusId;
  x: number;
  y: number;
  isInitial?: boolean;
  isTerminal?: boolean;
}

type RuleSeed =
  | { type: 'role'; params: { role: Role } }
  | { type: 'required_fields'; params: { fields: string[] } }
  | { type: 'assignee_only'; params?: null }
  | { type: 'reporter_only'; params?: null }
  | { type: 'not_self'; params?: null };

interface EdgeSeed {
  fromKey: string;
  toKey: string;
  label?: string | null;
  dashed?: boolean;
  rules?: RuleSeed[];
}

interface WorkflowSeed {
  slug: string;
  name: string;
  description: string;
  nodes: NodeSeed[];
  edges: EdgeSeed[];
}

export const DEFAULT_WORKFLOWS: readonly WorkflowSeed[] = [
  {
    slug: 'default',
    name: 'Default',
    description:
      'The standard six-state flow with reopen and request-changes back-edges. Used by Task, Bug, and Story by default.',
    nodes: [
      { key: 'n1', statusId: 'backlog', x: 40, y: 240, isInitial: true },
      { key: 'n2', statusId: 'todo', x: 220, y: 240 },
      { key: 'n3', statusId: 'in-progress', x: 400, y: 160 },
      { key: 'n4', statusId: 'in-review', x: 580, y: 160 },
      { key: 'n5', statusId: 'done', x: 760, y: 240, isTerminal: true },
      { key: 'n6', statusId: 'canceled', x: 400, y: 380, isTerminal: true },
    ],
    edges: [
      { fromKey: 'n1', toKey: 'n2' },
      { fromKey: 'n2', toKey: 'n3', rules: [{ type: 'assignee_only' }] },
      {
        fromKey: 'n3',
        toKey: 'n4',
        label: 'PR opened',
        rules: [
          { type: 'required_fields', params: { fields: ['estimate', 'assignee'] } },
        ],
      },
      {
        fromKey: 'n4',
        toKey: 'n5',
        label: 'approve',
        dashed: true,
        rules: [
          { type: 'role', params: { role: 'write' } },
          { type: 'not_self' },
        ],
      },
      { fromKey: 'n4', toKey: 'n3', label: 'request changes' },
      { fromKey: 'n3', toKey: 'n2' },
      { fromKey: 'n2', toKey: 'n6' },
      { fromKey: 'n3', toKey: 'n6' },
      { fromKey: 'n5', toKey: 'n2', label: 'reopen', dashed: true },
    ],
  },
  {
    slug: 'epic-coarse',
    name: 'Coarse',
    description:
      'Three-state flow for tracking epics loosely. No review phase; back-edge for reopen.',
    nodes: [
      { key: 'n1', statusId: 'todo', x: 100, y: 220, isInitial: true },
      { key: 'n2', statusId: 'in-progress', x: 360, y: 220 },
      { key: 'n3', statusId: 'done', x: 620, y: 220, isTerminal: true },
    ],
    edges: [
      { fromKey: 'n1', toKey: 'n2', label: 'start' },
      { fromKey: 'n2', toKey: 'n3', label: 'finish' },
      { fromKey: 'n3', toKey: 'n2', label: 'reopen', dashed: true },
    ],
  },
  {
    slug: 'epic-detailed',
    name: 'Detailed (with spec & review)',
    description:
      'Five-state flow for epics that go through a spec phase and require review before close.',
    nodes: [
      { key: 'n1', statusId: 'backlog', x: 40, y: 240, isInitial: true },
      { key: 'n2', statusId: 'todo', x: 220, y: 240 },
      { key: 'n3', statusId: 'in-progress', x: 400, y: 240 },
      { key: 'n4', statusId: 'in-review', x: 580, y: 240 },
      { key: 'n5', statusId: 'done', x: 760, y: 240, isTerminal: true },
    ],
    edges: [
      { fromKey: 'n1', toKey: 'n2', label: 'spec' },
      { fromKey: 'n2', toKey: 'n3', label: 'start' },
      { fromKey: 'n3', toKey: 'n4', label: 'submit for review' },
      { fromKey: 'n4', toKey: 'n3', label: 'request changes' },
      {
        fromKey: 'n4',
        toKey: 'n5',
        label: 'approve',
        dashed: true,
        rules: [{ type: 'role', params: { role: 'admin' } }],
      },
      { fromKey: 'n5', toKey: 'n3', label: 'reopen', dashed: true },
    ],
  },
];

/**
 * Insert every entry in `DEFAULT_WORKFLOWS` into the given workspace,
 * using the supplied transaction. Returns slug → workflowId so callers
 * (notably the demo seed) can wire downstream rows like
 * `project_workflows`.
 *
 * The caller owns the transaction lifecycle. If any insert throws, the
 * caller's `db.transaction(...)` rollback unwinds every workflow row,
 * its nodes, its transitions, and its rules — so a failed seed never
 * leaves a workspace half-configured.
 */
export async function seedDefaultWorkflowsForWorkspace(
  trx: Knex.Transaction,
  workspaceId: string
): Promise<Map<string, string>> {
  const slugToId = new Map<string, string>();
  for (const def of DEFAULT_WORKFLOWS) {
    const wf = await workflowService.create(
      {
        workspaceId,
        slug: def.slug,
        name: def.name,
        description: def.description,
      },
      trx
    );
    slugToId.set(def.slug, wf.id);

    const insertedNodes = await workflowService.replaceNodes(
      wf.id,
      def.nodes.map((n) => ({
        statusId: n.statusId,
        x: n.x,
        y: n.y,
        isInitial: n.isInitial,
        isTerminal: n.isTerminal,
      })),
      trx
    );
    // `replaceNodes` returns rows in insert order, so positional zip is safe.
    const nodeIdByKey = new Map<string, string>();
    def.nodes.forEach((n, i) => {
      const inserted = insertedNodes[i];
      if (!inserted) {
        throw new Error(
          `seedDefaultWorkflows: node insert mismatch (${def.slug}/${n.key})`
        );
      }
      nodeIdByKey.set(n.key, inserted.id);
    });

    await workflowService.replaceTransitions(
      wf.id,
      def.edges.map((e) => {
        const fromNodeId = nodeIdByKey.get(e.fromKey);
        const toNodeId = nodeIdByKey.get(e.toKey);
        if (!fromNodeId || !toNodeId) {
          throw new Error(
            `seedDefaultWorkflows: edge ${def.slug}:${e.fromKey}->${e.toKey} references unknown node`
          );
        }
        return {
          fromNodeId,
          toNodeId,
          label: e.label ?? null,
          dashed: e.dashed,
          rules: e.rules?.map((r) => ({
            type: r.type as RuleType,
            params: r.params ?? null,
          })),
        };
      }),
      trx
    );
  }
  return slugToId;
}
