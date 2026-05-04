import type { Knex } from 'knex';
import { db } from '../db/knex.js';
import { Theme, type ThemeRow } from '../entities/Theme.js';

type Q = Knex | Knex.Transaction;

const COLUMNS = [
  'id',
  'workspace_id',
  'name',
  'description',
  'color',
  'created_at',
  'updated_at',
] as const;

export async function getById(id: string, trx?: Q): Promise<Theme | null> {
  const row = (await (trx ?? db)('themes').where('id', id).select(COLUMNS).first()) as
    | ThemeRow
    | undefined;
  return row ? Theme.fromRow(row) : null;
}

export async function findByName(
  workspaceId: string,
  name: string,
  trx?: Q
): Promise<Theme | null> {
  const row = (await (trx ?? db)('themes')
    .where('workspace_id', workspaceId)
    .whereRaw('LOWER(name) = LOWER(?)', [name])
    .select(COLUMNS)
    .first()) as ThemeRow | undefined;
  return row ? Theme.fromRow(row) : null;
}

export async function listByWorkspace(workspaceId: string, trx?: Q): Promise<Theme[]> {
  const rows = (await (trx ?? db)('themes')
    .where('workspace_id', workspaceId)
    .select(COLUMNS)
    .orderBy('name', 'asc')) as ThemeRow[];
  return rows.map(Theme.fromRow);
}

export interface CreateThemeInput {
  workspaceId: string;
  name: string;
  description?: string | null;
  color?: string;
}

export async function create(input: CreateThemeInput, trx?: Q): Promise<Theme> {
  const [row] = (await (trx ?? db)('themes')
    .insert({
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? 'slate',
    })
    .returning(COLUMNS)) as ThemeRow[];
  return Theme.fromRow(row);
}

export interface UpdateThemeInput {
  name?: string;
  description?: string | null;
  color?: string;
}

export async function updateById(
  id: string,
  patch: UpdateThemeInput,
  trx?: Q
): Promise<Theme | null> {
  if (Object.keys(patch).length === 0) return getById(id, trx);
  const [row] = (await (trx ?? db)('themes')
    .where('id', id)
    .update({ ...patch, updatedAt: (trx ?? db).fn.now() })
    .returning(COLUMNS)) as ThemeRow[];
  return row ? Theme.fromRow(row) : null;
}

export async function deleteById(id: string, trx?: Q): Promise<boolean> {
  const n = await (trx ?? db)('themes').where('id', id).del();
  return n > 0;
}

// ---------- issue ↔ theme membership ----------

/**
 * Idempotent — re-attaching an existing membership is a no-op (the
 * underlying ON CONFLICT DO NOTHING avoids a duplicate-key error).
 */
export async function attachIssue(issueId: string, themeId: string, trx?: Q): Promise<void> {
  await (trx ?? db)('issue_themes')
    .insert({ issueId, themeId })
    .onConflict(['issue_id', 'theme_id'])
    .ignore();
}

export async function detachIssue(issueId: string, themeId: string, trx?: Q): Promise<boolean> {
  const n = await (trx ?? db)('issue_themes')
    .where('issue_id', issueId)
    .where('theme_id', themeId)
    .del();
  return n > 0;
}

export async function findThemeIdsForIssues(
  issueIds: string[],
  trx?: Q
): Promise<Map<string, string[]>> {
  if (issueIds.length === 0) return new Map();
  const rows = (await (trx ?? db)('issue_themes')
    .whereIn('issue_id', issueIds)
    .select('issue_id', 'theme_id')) as Array<{ issueId: string; themeId: string }>;
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const arr = out.get(r.issueId);
    if (arr) arr.push(r.themeId);
    else out.set(r.issueId, [r.themeId]);
  }
  return out;
}

export async function findIssueIdsForThemes(
  themeIds: string[],
  trx?: Q
): Promise<Map<string, string[]>> {
  if (themeIds.length === 0) return new Map();
  const rows = (await (trx ?? db)('issue_themes')
    .whereIn('theme_id', themeIds)
    .select('issue_id', 'theme_id')) as Array<{ issueId: string; themeId: string }>;
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const arr = out.get(r.themeId);
    if (arr) arr.push(r.issueId);
    else out.set(r.themeId, [r.issueId]);
  }
  return out;
}
