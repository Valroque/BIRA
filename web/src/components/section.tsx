// `<Section>` — titled block with optional subtitle, right-aligned action,
// and a `card` flag that wraps the children in a card panel. Used by every
// settings page and member/team management page so the title typography +
// spacing stays consistent.
//
// Two shapes are merged here:
//   - Settings-style: `<Section title=... card>` → wraps children in a card.
//   - Members-style: `<Section title=... action={<button>Add</button>}>` →
//     children render directly; consumer provides its own card if needed.
// Pass both flags together when a settings-style section needs an inline
// action (none of the current call sites do, but it's supported).

import type { ReactNode } from 'react';

export interface SectionProps {
  title: string;
  subtitle?: string;
  /** Right-aligned action (typically a button) on the title row. */
  action?: ReactNode;
  /** Wrap children in a card panel. Default false. */
  card?: boolean;
  /** Tint the title red and (when `card`) the card border with a danger color. */
  danger?: boolean;
  children: ReactNode;
}

export function Section({ title, subtitle, action, card, danger, children }: SectionProps) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: subtitle ? 4 : 12,
      }}>
        <h2 style={{
          fontSize: 14, fontWeight: 600, margin: 0,
          color: danger ? 'var(--blocked)' : 'var(--fg)',
        }}>{title}</h2>
        <div style={{ flex: 1 }} />
        {action}
      </div>
      {subtitle && (
        <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '0 0 12px' }}>
          {subtitle}
        </p>
      )}
      {card ? (
        <div
          className="card"
          style={{ padding: 16, borderColor: danger ? '#fecaca' : 'var(--border-muted)' }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
