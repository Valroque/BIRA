import type { Knex } from 'knex';
import { db } from '../db/knex.js';

type Q = Knex | Knex.Transaction;

// ---------- relates (symmetric) ----------

function canonical(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Idempotent — duplicate pairs collapse to one row via the composite
 * PK + onConflict-ignore.
 */
export async function addRelation(a: string, b: string, trx?: Q): Promise<void> {
  if (a === b) return;
  const [lo, hi] = canonical(a, b);
  await (trx ?? db)('issue_relates')
    .insert({ aId: lo, bId: hi })
    .onConflict(['a_id', 'b_id'])
    .ignore();
}

export async function removeRelation(a: string, b: string, trx?: Q): Promise<boolean> {
  if (a === b) return false;
  const [lo, hi] = canonical(a, b);
  const n = await (trx ?? db)('issue_relates').where('a_id', lo).where('b_id', hi).del();
  return n > 0;
}

export async function findRelatedIdsByIssue(issueId: string, trx?: Q): Promise<string[]> {
  const rows = (await (trx ?? db)('issue_relates')
    .where('a_id', issueId)
    .orWhere('b_id', issueId)
    .select('a_id', 'b_id')) as Array<{ aId: string; bId: string }>;
  return rows.map((r) => (r.aId === issueId ? r.bId : r.aId));
}

export async function findRelatedIdsByIssues(
  issueIds: string[],
  trx?: Q
): Promise<Map<string, string[]>> {
  if (issueIds.length === 0) return new Map();
  const rows = (await (trx ?? db)('issue_relates')
    .whereIn('a_id', issueIds)
    .orWhereIn('b_id', issueIds)
    .select('a_id', 'b_id')) as Array<{ aId: string; bId: string }>;
  const want = new Set(issueIds);
  const out = new Map<string, string[]>();
  for (const r of rows) {
    if (want.has(r.aId)) {
      const arr = out.get(r.aId);
      if (arr) arr.push(r.bId);
      else out.set(r.aId, [r.bId]);
    }
    if (want.has(r.bId)) {
      const arr = out.get(r.bId);
      if (arr) arr.push(r.aId);
      else out.set(r.bId, [r.aId]);
    }
  }
  return out;
}

// ---------- depends-on (directed) ----------

export async function addDependency(
  blockerId: string,
  dependentId: string,
  trx?: Q
): Promise<void> {
  await (trx ?? db)('issue_dependencies')
    .insert({ blockerId, dependentId })
    .onConflict(['blocker_id', 'dependent_id'])
    .ignore();
}

export async function removeDependency(
  blockerId: string,
  dependentId: string,
  trx?: Q
): Promise<boolean> {
  const n = await (trx ?? db)('issue_dependencies')
    .where('blocker_id', blockerId)
    .where('dependent_id', dependentId)
    .del();
  return n > 0;
}

/**
 * Predecessors — ids of issues this issue depends on.
 */
export async function findDependsOn(issueId: string, trx?: Q): Promise<string[]> {
  const rows = (await (trx ?? db)('issue_dependencies')
    .where('dependent_id', issueId)
    .select('blocker_id')) as Array<{ blockerId: string }>;
  return rows.map((r) => r.blockerId);
}

/**
 * Successors — ids of issues that depend on this issue.
 */
export async function findDependedOnBy(issueId: string, trx?: Q): Promise<string[]> {
  const rows = (await (trx ?? db)('issue_dependencies')
    .where('blocker_id', issueId)
    .select('dependent_id')) as Array<{ dependentId: string }>;
  return rows.map((r) => r.dependentId);
}

export async function findDependsOnByIssues(
  issueIds: string[],
  trx?: Q
): Promise<Map<string, string[]>> {
  if (issueIds.length === 0) return new Map();
  const rows = (await (trx ?? db)('issue_dependencies')
    .whereIn('dependent_id', issueIds)
    .select('blocker_id', 'dependent_id')) as Array<{ blockerId: string; dependentId: string }>;
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const arr = out.get(r.dependentId);
    if (arr) arr.push(r.blockerId);
    else out.set(r.dependentId, [r.blockerId]);
  }
  return out;
}

export async function findDependedOnByByIssues(
  issueIds: string[],
  trx?: Q
): Promise<Map<string, string[]>> {
  if (issueIds.length === 0) return new Map();
  const rows = (await (trx ?? db)('issue_dependencies')
    .whereIn('blocker_id', issueIds)
    .select('blocker_id', 'dependent_id')) as Array<{ blockerId: string; dependentId: string }>;
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const arr = out.get(r.blockerId);
    if (arr) arr.push(r.dependentId);
    else out.set(r.blockerId, [r.dependentId]);
  }
  return out;
}

/**
 * Would adding the edge "dependent depends on blocker" create a cycle?
 *
 * Each row stores `(blocker_id, dependent_id)` and represents the graph
 * edge `dependent → blocker` ("this task waits for that one"). The new
 * edge would be `dependentId → blockerId`. A cycle is created iff there
 * is already a back-path `blockerId → … → dependentId` in the graph.
 * We seed the recursive CTE at the new edge's blocker and walk forward
 * along `dependent → blocker` until we either reach the new edge's
 * dependent (cycle) or run out of edges. Recursion is capped at 256
 * hops to be safe even if the persisted data is somehow already
 * cyclic.
 */
export async function wouldCreateCycle(
  blockerId: string,
  dependentId: string,
  trx?: Q
): Promise<boolean> {
  if (blockerId === dependentId) return true;
  const result = (await (trx ?? db).raw(
    `
    WITH RECURSIVE reach AS (
      SELECT blocker_id AS target, 1 AS depth
      FROM issue_dependencies
      WHERE dependent_id = ?
      UNION
      SELECT d.blocker_id, r.depth + 1
      FROM issue_dependencies d
      JOIN reach r ON d.dependent_id = r.target
      WHERE r.depth < 256
    )
    SELECT 1 FROM reach WHERE target = ? LIMIT 1
    `,
    [blockerId, dependentId]
  )) as { rows: unknown[] };
  return result.rows.length > 0;
}
