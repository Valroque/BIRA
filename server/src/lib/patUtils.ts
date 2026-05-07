import crypto from 'node:crypto';

/**
 * Personal access token (PAT) crypto helpers.
 *
 * These intentionally live in a separate module from `passwordUtils.ts`:
 * passwords use bcrypt (a slow KDF that defends against offline dictionary
 * attacks on low-entropy human input), PATs use plain SHA-256 (fast
 * indexed equality on a 256-bit random secret — there's no offline-
 * grinding pressure to defend against, unlike passwords). Mixing them
 * in one file would invite future confusion about which primitive to
 * use where.
 *
 * Token shape: `bira_pat_<43-char-base64url-no-padding>`. The
 * `bira_pat_` prefix is the GitHub-style "secret-scanning friendly"
 * pattern (`ghp_…`, `xoxb-…`) — enables grep / GitHub's secret scanner
 * to flag accidental commits.
 */

export const PAT_PREFIX = 'bira_pat_';

export interface PatSecret {
  /** The full plaintext token. Show ONCE to the user, never log or persist. */
  plaintext: string;
  /** SHA-256 hex of the plaintext — what gets stored in `token_hash`. */
  hashHex: string;
  /** Last 4 chars of the plaintext — fingerprint for the UI list. */
  last4: string;
}

/**
 * Generate a fresh PAT secret. Caller persists `hashHex` + `last4` and
 * returns `plaintext` to the user EXACTLY ONCE in the create response —
 * after that there's no way to recover it (by design).
 */
export function generatePatSecret(): PatSecret {
  // 32 random bytes → 43 char base64url (no padding). Plus the 9-char
  // prefix gives 52 total chars — fits comfortably in a 64-char column,
  // and `last4` always slices the trailing 4 chars of the random
  // portion (the prefix is fixed, so it carries no fingerprint value).
  const random = crypto.randomBytes(32).toString('base64url');
  const plaintext = `${PAT_PREFIX}${random}`;
  const hashHex = hashPat(plaintext);
  const last4 = plaintext.slice(-4);
  return { plaintext, hashHex, last4 };
}

/**
 * Hash a PAT plaintext for lookup. Lowercase 64-char hex — must match
 * the `token_hash` column shape exactly.
 *
 * Note: a wrong-length / non-`bira_pat_` string is silently hashed too
 * — callers that need to reject wrong-shape input should check the
 * prefix BEFORE calling this. The middleware does so.
 */
export function hashPat(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}
