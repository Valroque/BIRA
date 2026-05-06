// Inline @ mention picker — appears just above the caret when the user
// types `@` in a composer. Renders a small floating list of candidates;
// Escape or an outside click dismisses without inserting.
//
// Search is delegated to `useMentionSearch` (debounced, abort-on-change,
// surfaces loading + error so the picker can give the user feedback rather
// than silently flickering). The 5-arg API call lives in
// `src/api/mentionables.ts`.

import { useRef } from 'react';
import { useDismiss } from './use-dismiss';
import { Avatar } from './shell';
import { useMentionSearch } from '../hooks/useMentionSearch';
import type { MentionableHit } from '../api/mentionables';

interface MentionPickerProps {
  query: string;
  onSelect: (hit: MentionableHit) => void;
  onDismiss: () => void;
}

export function MentionPicker({ query, onSelect, onDismiss }: MentionPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Escape closes the picker; outside click closes it too.
  useDismiss(ref, onDismiss, true);

  const { hits, loading, error } = useMentionSearch(query, { types: ['user', 'team'] });

  // Hide entirely when there's nothing to show and we're idle — keeps the
  // composer surface uncluttered until there's a real signal. Loading + error
  // states render so the user sees feedback while typing.
  if (!loading && !error && hits.length === 0) return null;

  return (
    <div
      ref={ref}
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-md)',
        minWidth: 220,
        maxWidth: 300,
        overflow: 'hidden',
      }}
    >
      {error && (
        <div
          style={{
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--canceled)',
          }}
        >
          Couldn't load suggestions
        </div>
      )}
      {!error && loading && hits.length === 0 && (
        <div
          style={{
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--fg-muted)',
          }}
        >
          Searching…
        </div>
      )}
      {hits.map((hit) => (
        <button
          key={`${hit.type}:${hit.id}`}
          type="button"
          onMouseDown={(e) => {
            // mousedown fires before blur on the textarea; preventDefault
            // keeps the textarea focused so the cursor position is still valid
            // when the caller reads selectionStart.
            e.preventDefault();
            onSelect(hit);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            padding: '7px 12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-subtle)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'none';
          }}
        >
          <Avatar name={hit.label} size={28} color={hit.color ?? undefined} />
          <span style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, lineHeight: 1.3 }}>
              {hit.label}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: 'var(--fg-muted)',
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {hit.sublabel}
            </div>
          </span>
        </button>
      ))}
    </div>
  );
}
