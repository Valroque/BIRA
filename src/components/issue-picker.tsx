// Reusable "pick an issue" modal — search + filtered list. Used by the
// issue-detail inspector to add child / related links. Selection is a
// single click; multi-pick can be added later by wrapping with a stage
// list, but most flows so far want one at a time.

import { useMemo, useState } from 'react';
import { Modal, ModalHeader } from './modal';
import { Icon } from './icons';
import { TypeChip } from './shell';
import { ISSUES, type Issue } from '../fixtures';

interface IssuePickerModalProps {
  title?: string;
  /** Subtext shown under the title. Useful to explain a constraint. */
  subtitle?: string;
  /** Restrict to issues that match this predicate. */
  filter?: (issue: Issue) => boolean;
  /** Issue ids to hide from the list (current issue, already-linked, etc.). */
  excludeIds?: string[];
  onSelect: (issue: Issue) => void;
  onClose: () => void;
}

export function IssuePickerModal({
  title = 'Link an issue',
  subtitle,
  filter,
  excludeIds = [],
  onSelect,
  onClose,
}: IssuePickerModalProps) {
  const [query, setQuery] = useState('');
  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ISSUES.filter((i) => {
      if (exclude.has(i.id)) return false;
      if (filter && !filter(i)) return false;
      if (!q) return true;
      return i.id.toLowerCase().includes(q) || i.title.toLowerCase().includes(q);
    }).slice(0, 50);
  }, [query, filter, exclude]);

  return (
    <Modal onClose={onClose} maxWidth={560} maxHeight="70vh" align="top" label={title}>
      <ModalHeader title={title} onClose={onClose} />
      {subtitle && (
        <div style={{
          padding: '8px 18px 0', fontSize: 12, color: 'var(--fg-muted)',
        }}>{subtitle}</div>
      )}
      <div style={{
        padding: '10px 18px', borderBottom: '1px solid var(--border-muted)',
        position: 'relative', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', left: 26, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--fg-faint)', display: 'inline-flex',
        }}>
          <Icon name="search" size={13} />
        </span>
        <input
          autoFocus
          className="input input-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by id or title…"
          style={{ paddingLeft: 28, width: '100%' }}
        />
      </div>
      <div className="scroll" style={{ flex: 1, overflow: 'auto' }}>
        {matches.length === 0 ? (
          <div style={{
            padding: '32px 18px', textAlign: 'center',
            color: 'var(--fg-muted)', fontSize: 13,
          }}>
            No matching issues.
          </div>
        ) : (
          matches.map((issue) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => onSelect(issue)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 18px', textAlign: 'left',
                background: 'transparent', border: 'none',
                borderBottom: '1px solid var(--border-muted)',
                cursor: 'pointer', fontSize: 13, color: 'var(--fg)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <TypeChip type={issue.type} />
              <span className="mono" style={{ color: 'var(--fg-muted)', fontSize: 12, flexShrink: 0 }}>
                {issue.id}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {issue.title}
              </span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
