import { AppError, ServiceError } from '../../lib/errors.js';
import { generatePatSecret } from '../../lib/patUtils.js';
import * as patService from '../../services/personalAccessTokenService.js';
import type { PersonalAccessToken } from '../../entities/PersonalAccessToken.js';

export type PatExpiresIn = 'never' | '30d' | '90d' | '1y';

const VALID_EXPIRES_IN: readonly PatExpiresIn[] = ['never', '30d', '90d', '1y'] as const;

/**
 * Per-user cap on currently-active (non-revoked, non-expired) tokens.
 * The 11th create attempt returns 422 `PAT_LIMIT_REACHED`. Revoked rows
 * stay in the table as audit trail and don't count toward the cap.
 */
const PAT_ACTIVE_LIMIT = 10;

export interface CreateTokenInput {
  userId: string;
  name: string;
  expiresIn: PatExpiresIn;
}

export interface CreateTokenResult {
  token: PersonalAccessToken;
  /** Plaintext — return EXACTLY ONCE in the create response, then forget. */
  plaintext: string;
}

/**
 * Map `expiresIn` to a concrete timestamp (or null = never expires).
 * Computed at usecase time so the column is a stable absolute date,
 * not a relative offset re-evaluated on every read.
 */
function resolveExpiresAt(expiresIn: PatExpiresIn): Date | null {
  if (expiresIn === 'never') return null;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  switch (expiresIn) {
    case '30d':
      return new Date(now + 30 * day);
    case '90d':
      return new Date(now + 90 * day);
    case '1y':
      return new Date(now + 365 * day);
  }
}

/**
 * Mint a new Personal Access Token for the given user.
 *
 * Defence-in-depth — the route's Zod schema also validates these, but a
 * direct usecase caller (a future seeder, a test factory) gets the same
 * 400/422 surfaces. The plaintext is generated here, hashed, and the
 * caller (route) returns it ONCE in the response — it is never logged
 * and never stored in plaintext.
 */
export async function createToken(input: CreateTokenInput): Promise<CreateTokenResult> {
  if (!input.name || !input.name.trim()) {
    throw new AppError('name is required', 400);
  }
  if (input.name.length > 64) {
    throw new AppError('name must be 64 characters or fewer', 400);
  }
  if (!VALID_EXPIRES_IN.includes(input.expiresIn)) {
    throw new AppError(
      `expiresIn must be one of: ${VALID_EXPIRES_IN.join(', ')}`,
      400
    );
  }

  // Cap check. Counts active rows only — revoked tokens don't gate
  // the user from minting a fresh one.
  const activeCount = await patService.countActiveByUser(input.userId);
  if (activeCount >= PAT_ACTIVE_LIMIT) {
    throw new ServiceError(
      `You already have ${PAT_ACTIVE_LIMIT} active tokens. Revoke one before creating another.`,
      422,
      'PAT_LIMIT_REACHED'
    );
  }

  const secret = generatePatSecret();
  const expiresAt = resolveExpiresAt(input.expiresIn);

  const token = await patService.insert({
    userId: input.userId,
    name: input.name,
    tokenHash: secret.hashHex,
    last4: secret.last4,
    expiresAt,
  });

  return { token, plaintext: secret.plaintext };
}
