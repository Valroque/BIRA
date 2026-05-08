import * as patService from '../../services/personalAccessTokenService.js';
import type { PersonalAccessToken } from '../../entities/PersonalAccessToken.js';

export interface ListTokensInput {
  userId: string;
}

/**
 * Lists the user's tokens for the FE Settings panel and the MCP `list_pats`
 * tool. Active rows (non-revoked) bubble to the top, ordered by recency
 * of use; revoked rows trail at the bottom for audit context. The entity
 * never carries `tokenHash`, so callers can hand the result straight to
 * the wire.
 */
export async function listTokens(input: ListTokensInput): Promise<PersonalAccessToken[]> {
  return patService.listByUser(input.userId);
}
