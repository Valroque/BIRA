import * as mentionableService from '../../services/mentionableService.js';
import type { MentionableHit } from '../../services/mentionableService.js';
import { AppError } from '../../lib/errors.js';

const VALID_TYPES = new Set(['user', 'team'] as const);

export async function searchMentionables(input: {
  workspaceId: string;
  tenantId: string;
  q: string;
  types?: string[];
  limit?: number;
}): Promise<MentionableHit[]> {
  const q = input.q.trim();
  if (!q) throw new AppError('q is required', 400);

  const filtered = (input.types ?? []).filter(
    (t): t is 'user' | 'team' => VALID_TYPES.has(t as 'user' | 'team')
  );
  const types: Array<'user' | 'team'> = filtered.length > 0 ? filtered : ['user', 'team'];

  const limit = Math.min(Math.max(input.limit ?? 8, 1), 20);

  return mentionableService.searchMentionables({
    workspaceId: input.workspaceId,
    tenantId: input.tenantId,
    q,
    types,
    limit,
  });
}
