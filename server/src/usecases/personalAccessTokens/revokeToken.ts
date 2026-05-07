import { ServiceError } from '../../lib/errors.js';
import * as patService from '../../services/personalAccessTokenService.js';

export interface RevokeTokenInput {
  userId: string;
  tokenId: string;
}

export interface RevokeTokenResult {
  id: string;
}

/**
 * Revoke a token by id, scoped to the calling user.
 *
 * The service helper UPDATE-RETURNINGs only when `id matches AND user_id
 * matches AND revoked_at IS NULL`, so:
 *   - bogus id              → null     → 404 PAT_NOT_FOUND
 *   - other user's token id → null     → 404 PAT_NOT_FOUND (no info leak)
 *   - already-revoked       → null     → 404 PAT_NOT_FOUND (treated as gone)
 *
 * The "already-revoked → 404" choice is deliberate: a successful revoke
 * is observable (the token stops working), so a second call has nothing
 * useful to do; surfacing 404 lets the caller refresh and see the row's
 * `revokedAt` already set.
 */
export async function revokeToken(input: RevokeTokenInput): Promise<RevokeTokenResult> {
  const revoked = await patService.revoke({
    userId: input.userId,
    tokenId: input.tokenId,
  });
  if (!revoked) {
    throw new ServiceError(
      `Token '${input.tokenId}' not found`,
      404,
      'PAT_NOT_FOUND'
    );
  }
  return { id: revoked.id };
}
