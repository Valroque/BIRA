export interface MentionRef {
  type: 'user' | 'team';
  id: string;
}

const MENTION_RE = /@\[([a-z]+):([0-9a-f-]{36})\]/gi;
const ALLOWED_TYPES = new Set<string>(['user', 'team']);

/**
 * Extract all @[type:uuid] tokens from a comment body.
 * Deduplicates by type+id. Returns [] for empty or mention-free bodies.
 */
export function parseMentions(body: string): MentionRef[] {
  if (!body) return [];

  const seen = new Set<string>();
  const result: MentionRef[] = [];

  let match: RegExpExecArray | null;
  // Reset lastIndex since the regex is stateful (global flag).
  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(body)) !== null) {
    const type = match[1].toLowerCase();
    const id = match[2];
    if (!ALLOWED_TYPES.has(type)) continue;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ type: type as 'user' | 'team', id });
  }

  return result;
}
