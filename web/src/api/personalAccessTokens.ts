// Personal Access Tokens API.
//
// BE catalogue (verified — see `server/src/routes/auth.ts`):
//
//   POST   /api/auth/tokens          → create (returns plaintext exactly once)
//   GET    /api/auth/tokens          → list (never returns plaintext)
//   DELETE /api/auth/tokens/:id      → revoke
//
// All three require JWT auth (a stolen PAT cannot mint or revoke other PATs).
// The BE returns the entity in camelCase already (see
// `server/src/entities/PersonalAccessToken.ts`), with all timestamps as ISO
// strings. No adapter needed — we just declare the shape that mirrors the
// entity's PUBLIC columns. `tokenHash` is intentionally absent.

import { apiFetch } from './client';

/** Mirrors `PersonalAccessToken` entity's public shape. NEVER includes `tokenHash`. */
export interface PersonalAccessToken {
  id: string;
  userId: string;
  name: string;
  /** Last 4 chars of the plaintext, for the UI fingerprint chip. */
  last4: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export type PatExpiresIn = 'never' | '30d' | '90d' | '1y';

export interface CreateTokenInput {
  name: string;
  expiresIn: PatExpiresIn;
}

export interface CreateTokenResult {
  token: PersonalAccessToken;
  /** Plaintext — surfaced in the create-result modal exactly once, then forgotten. */
  plaintext: string;
}

export async function listTokens(): Promise<PersonalAccessToken[]> {
  return apiFetch<PersonalAccessToken[]>('/api/auth/tokens');
}

export async function createToken(input: CreateTokenInput): Promise<CreateTokenResult> {
  return apiFetch<CreateTokenResult>('/api/auth/tokens', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function revokeToken(tokenId: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/api/auth/tokens/${tokenId}`, {
    method: 'DELETE',
  });
}
