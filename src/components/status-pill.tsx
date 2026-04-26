// `<StatusPill>` — small status-colored chip with a leading dot.
//
// Used by: board cards (when a column groups multiple statuses, the card
// shows which it actually has), the board-config panel's per-column status
// chips, and the unassigned-statuses warning. Each call site previously
// hand-pasted the same `var(--${status}-bg)` / `var(--${status})` markup.
//
// `issue-detail.tsx`'s status-themed Status button is a full-width button
// with the same colors; not a pill — left as-is.

import type { CSSProperties, ReactNode } from 'react';
import { StatusDot, STATUSES, type StatusId } from './shell';

interface StatusPillProps {
  status: StatusId | string;
  /** Visible label. Defaults to the canonical name from `STATUSES`. */
  label?: string;
  /** Dot diameter in px. Default 9. */
  dotSize?: number;
  /** Trailing content rendered after the label (e.g. a remove button). */
  trailing?: ReactNode;
  style?: CSSProperties;
  'data-tip'?: string;
}

export function StatusPill({
  status, label, dotSize = 9, trailing, style, ...rest
}: StatusPillProps) {
  const meta = STATUSES.find((s) => s.id === status);
  const text = label ?? meta?.name ?? status;
  return (
    <span
      data-tip={rest['data-tip']}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 6px 2px 7px', borderRadius: 10,
        background: `var(--${status}-bg)`, color: `var(--${status})`,
        fontSize: 11.5, fontWeight: 500,
        ...style,
      }}
    >
      <StatusDot status={status} size={dotSize} />
      <span>{text}</span>
      {trailing}
    </span>
  );
}
