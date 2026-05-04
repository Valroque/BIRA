// Shared form helpers — `<Field>`, `<Hint>`, `<DangerRow>`. Used by every
// settings / form modal / setup screen so the label typography + spacing
// stays consistent in one place.
//
// `Field` wraps a control in a <label> so the uppercase header is the
// associated label for the input (clicking it focuses the input).
//
// Note: workflow.tsx has its own compact Field (no uppercase, smaller
// spacing) because it lives in a dense side panel. That's a deliberate
// variant — leave it alone.

import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  /** Adds a "· optional" suffix in muted text after the label. */
  optional?: boolean;
  children: ReactNode;
}
export function Field({ label, optional, children }: FieldProps) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)',
        textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>{label}</span>
        {optional && (
          <span style={{
            color: 'var(--fg-faint)', fontWeight: 500,
            textTransform: 'none', letterSpacing: 0,
          }}>· optional</span>
        )}
      </div>
      {children}
    </label>
  );
}

interface HintProps {
  children: ReactNode;
  /** Tint the hint red — used by warning text under a destructive input. */
  warning?: boolean;
}
export function Hint({ children, warning }: HintProps) {
  return (
    <div style={{
      marginTop: 4, fontSize: 11,
      color: warning ? 'var(--blocked)' : 'var(--fg-faint)',
    }}>
      {children}
    </div>
  );
}

interface DangerRowProps {
  label: string;
  description: string;
  actionLabel: string;
  /** Click handler for the action button. Wire this to the actual destructive flow. */
  onAction?: () => void;
}
export function DangerRow({ label, description, actionLabel, onAction }: DangerRowProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0', borderBottom: '1px solid var(--border-muted)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>{description}</div>
      </div>
      <button onClick={onAction} className="btn btn-danger btn-sm">{actionLabel}</button>
    </div>
  );
}
