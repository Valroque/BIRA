import type { Knex } from 'knex';
import { db } from '../db/knex.js';
import {
  PersonalAccessToken,
  type PersonalAccessTokenRow,
} from '../entities/PersonalAccessToken.js';
import { logger } from '../middleware/logger.js';

/**
 * Thin data-access service for the `personal_access_tokens` table.
 * Owns: personal_access_tokens.
 *
 * Note: `token_hash` is NEVER returned from these helpers. Lookups by
 * hash use a dedicated, narrowly-scoped helper (`findActiveByHash`) that
 * still excludes the column from its return value — only the row's id
 * + ownership data leaves the service.
 */

const PUBLIC_COLUMNS = [
  'id',
  'user_id',
  'name',
  'last4',
  'last_used_at',
  'expires_at',
  'revoked_at',
  'created_at',
  'updated_at',
] as const;

type Q = Knex | Knex.Transaction;

export async function getById(id: string, trx?: Q): Promise<PersonalAccessToken | null> {
  const row = (await (trx ?? db)('personal_access_tokens')
    .where('id', id)
    .select(PUBLIC_COLUMNS)
    .first()) as PersonalAccessTokenRow | undefined;
  return row ? PersonalAccessToken.fromRow(row) : null;
}

/**
 * Look up a PAT by its sha256 hash AND validate it's currently usable
 * (not revoked, not expired). Used only by the auth middleware — keep
 * the validity check close to the read so callers can't accidentally
 * skip it.
 *
 * Returns the entity (no `tokenHash`) plus the owning `userId` so the
 * caller can fan out to `userService.getById`. Two queries, no JOIN
 * (memory: `feedback_no_db_joins_without_approval`).
 */
export async function findActiveByHash(
  hashHex: string,
  trx?: Q
): Promise<PersonalAccessToken | null> {
  const row = (await (trx ?? db)('personal_access_tokens')
    .where('token_hash', hashHex)
    .whereNull('revoked_at')
    .andWhere((qb) => {
      qb.whereNull('expires_at').orWhere('expires_at', '>', (trx ?? db).fn.now());
    })
    .select(PUBLIC_COLUMNS)
    .first()) as PersonalAccessTokenRow | undefined;
  return row ? PersonalAccessToken.fromRow(row) : null;
}

/**
 * List the user's tokens for the FE Settings panel. Active (non-revoked)
 * rows first, ordered by `last_used_at DESC NULLS LAST, created_at DESC`
 * so freshly-used tokens float to the top while still surfacing brand-
 * new (never-used) ones above older revoked ones. Revoked rows trail at
 * the bottom — kept for audit trail.
 */
export async function listByUser(userId: string, trx?: Q): Promise<PersonalAccessToken[]> {
  const rows = (await (trx ?? db)('personal_access_tokens')
    .where('user_id', userId)
    .select(PUBLIC_COLUMNS)
    // ORDER BY clauses are evaluated left-to-right; first by revoked_at
    // (NULL = active = top), then within each bucket by last-used / created.
    .orderByRaw('revoked_at IS NULL DESC, last_used_at DESC NULLS LAST, created_at DESC')
    ) as PersonalAccessTokenRow[];
  return rows.map(PersonalAccessToken.fromRow);
}

/**
 * Count the user's CURRENTLY-ACTIVE tokens (non-revoked, non-expired).
 * Used by the createToken usecase to enforce the 10-PAT cap.
 */
export async function countActiveByUser(userId: string, trx?: Q): Promise<number> {
  const result = (await (trx ?? db)('personal_access_tokens')
    .where('user_id', userId)
    .whereNull('revoked_at')
    .andWhere((qb) => {
      qb.whereNull('expires_at').orWhere('expires_at', '>', (trx ?? db).fn.now());
    })
    .count<{ count: string }[]>('id as count')
    .first()) as { count: string } | undefined;
  return result ? Number(result.count) : 0;
}

export interface InsertPatInput {
  userId: string;
  name: string;
  /** SHA-256 hex of the plaintext. Service stores; never derives. */
  tokenHash: string;
  /** Last 4 chars of the plaintext, for UI fingerprint. */
  last4: string;
  /** `null` means "never expires". */
  expiresAt: Date | null;
}

export async function insert(input: InsertPatInput, trx?: Q): Promise<PersonalAccessToken> {
  const [row] = (await (trx ?? db)('personal_access_tokens')
    .insert({
      userId: input.userId,
      name: input.name,
      tokenHash: input.tokenHash,
      last4: input.last4,
      expiresAt: input.expiresAt,
    })
    .returning(PUBLIC_COLUMNS)) as PersonalAccessTokenRow[];
  return PersonalAccessToken.fromRow(row);
}

/**
 * Revoke a token by id, scoped to a user (ownership check) and to
 * non-revoked rows (idempotent-style: a second revoke of the same token
 * returns `null`, which the usecase translates to 404 — already-revoked
 * is treated as not-found).
 */
export async function revoke(
  args: { userId: string; tokenId: string },
  trx?: Q
): Promise<PersonalAccessToken | null> {
  const [row] = (await (trx ?? db)('personal_access_tokens')
    .where({ id: args.tokenId, userId: args.userId })
    .whereNull('revoked_at')
    .update({ revokedAt: (trx ?? db).fn.now(), updatedAt: (trx ?? db).fn.now() })
    .returning(PUBLIC_COLUMNS)) as PersonalAccessTokenRow[];
  return row ? PersonalAccessToken.fromRow(row) : null;
}

/**
 * Best-effort UPDATE of `last_used_at`. Wrapped here (not at the
 * caller) so the auth middleware can fire-and-forget without juggling
 * try/catch on every authenticated request. A failure here MUST NOT
 * fail the request — auth has already succeeded; this is just bookkeeping.
 */
export async function touchLastUsed(tokenId: string, trx?: Q): Promise<void> {
  try {
    await (trx ?? db)('personal_access_tokens')
      .where('id', tokenId)
      .update({ lastUsedAt: (trx ?? db).fn.now() });
  } catch (err) {
    logger.warn('PAT touchLastUsed failed', {
      tokenId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
