// Mentionables — the set of things a user can @-mention in comments.
// For v1 this is members-only. The list is derived from the fixture tenant
// member roster rather than fetched from the API, because the members
// endpoint is not yet part of this phase. Slice C will add team mentions
// and real API resolution.

import { TENANT_MEMBERS } from '../fixtures';

export interface MentionableHit {
  type: 'user';
  id: string;      // email used as the stable id for now
  label: string;   // display name
  sublabel: string; // email
}

/**
 * Return mentionable users for the current tenant whose name or email
 * contains `query` (case-insensitive). Always returns a capped list.
 */
export function searchMentionables(
  tenant: string,
  query: string,
): MentionableHit[] {
  const members = TENANT_MEMBERS[tenant] ?? [];
  const q = query.toLowerCase();
  return members
    .filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q),
    )
    .slice(0, 8)
    .map((m) => ({
      type: 'user' as const,
      id: m.email,
      label: m.name,
      sublabel: m.email,
    }));
}
