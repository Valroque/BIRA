import { useState, useEffect } from 'react';
import { searchMentionables, type MentionableHit } from '../api/mentionables';
import { useTenantContext } from '../components/shell';

const EMPTY = { hits: [] as MentionableHit[], loading: false, error: null };

export function useMentionSearch(
  query: string,
  opts?: { types?: Array<'user' | 'team'>; enabled?: boolean },
): { hits: MentionableHit[]; loading: boolean; error: string | null } {
  const { tenant, workspace } = useTenantContext();
  const enabled = opts?.enabled !== false;

  const [hits, setHits] = useState<MentionableHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || query.trim().length < 1) {
      setHits([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let debounceTimer: ReturnType<typeof setTimeout>;

    debounceTimer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await searchMentionables(tenant, workspace, query, { types: opts?.types }, {
          signal: controller.signal,
        });
        setHits(results);
      } catch (err: unknown) {
        // AbortError means a newer query cancelled this one — ignore silently.
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Search failed');
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => {
      clearTimeout(debounceTimer);
      controller.abort();
    };
  // opts.types changes identity each render if caller passes a literal array,
  // so stringify it to avoid spurious refetches.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, enabled, tenant, workspace, JSON.stringify(opts?.types)]);

  if (!enabled || query.trim().length < 1) return EMPTY;
  return { hits, loading, error };
}
