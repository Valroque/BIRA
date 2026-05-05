// Inline @ mention picker — appears just above the caret when the user
// types `@` in a composer. Renders a small floating list of candidates;
// Escape or an outside click dismisses without inserting.

import { useRef } from 'react';
import { useDismiss } from './use-dismiss';
import { searchMentionables, type MentionableHit } from '../api/mentionables';
import { useTenantContext } from './shell';

interface MentionPickerProps {
  query: string;
  onSelect: (hit: MentionableHit) => void;
  onDismiss: () => void;
}

export function MentionPicker({ query, onSelect, onDismiss }: MentionPickerProps) {
  const { tenant } = useTenantContext();
  const ref = useRef<HTMLDivElement>(null);

  // Escape closes the picker; outside click closes it too.
  useDismiss(ref, onDismiss, true);

  const hits = searchMentionables(tenant, query);

  if (hits.length === 0) return null;

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
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--accent-muted)',
              color: 'var(--accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {hit.label.slice(0, 2).toUpperCase()}
          </span>
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
