// Mentionables API — search users + teams in a workspace for the @-mention
// picker. The server endpoint accepts `q`, `types`, and `limit` query params
// and returns `[{ type, id, label, sublabel, ... }]`.
//
// Empty / blank query short-circuits to `[]` without hitting the network —
// matches the existing UX where the picker only renders for non-empty input
// and avoids a needless 400 from the BE which requires `q` to be non-empty.

import { apiFetch } from './client';
import {
  adaptMentionable,
  type MentionableHit,
  type RawMentionable,
} from './adapters/mentionable.adapter';

export type { MentionableHit } from './adapters/mentionable.adapter';

export interface SearchMentionablesOptions {
  /** Restrict to subset of types. Omit / empty → both users and teams. */
  types?: Array<'user' | 'team'>;
  /** Max hits to return. Server caps at 20; default 8. */
  limit?: number;
}

export interface SearchMentionablesFetchOptions {
  /** Cancel the request when the caller debounces / unmounts. */
  signal?: AbortSignal;
}

/**
 * Search mentionables in the given workspace. Returns an empty list for a
 * blank query so callers don't have to special-case it. UUIDs in the result
 * are opaque ids — never render them; surface `label` / `sublabel` instead.
 */
export async function searchMentionables(
  tenantSlug: string,
  workspaceSlug: string,
  query: string,
  opts: SearchMentionablesOptions = {},
  fetchOpts: SearchMentionablesFetchOptions = {},
): Promise<MentionableHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams();
  params.set('q', trimmed);
  if (opts.types && opts.types.length > 0) {
    params.set('types', opts.types.join(','));
  }
  if (opts.limit !== undefined) {
    params.set('limit', String(opts.limit));
  }

  const raw = await apiFetch<RawMentionable[]>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/mentionables/search?${params.toString()}`,
    { signal: fetchOpts.signal },
  );

  return raw.map(adaptMentionable);
}
