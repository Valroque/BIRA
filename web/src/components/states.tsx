// Shared visual primitives for empty / error / loading states.
import type { ReactNode } from 'react';
import { Icon } from './icons';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: ReactNode;
  /** Optional action (button, link). */
  action?: ReactNode;
  /** Inline (small) vs full-page. */
  size?: 'inline' | 'page';
}

export function EmptyState({ icon = 'inbox', title, description, action, size = 'page' }: EmptyStateProps) {
  const padding = size === 'inline' ? '24px 16px' : '64px 32px';
  const iconSize = size === 'inline' ? 24 : 36;
  return (
    <div style={{
      padding, textAlign: 'center', color: 'var(--fg-muted)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      <div style={{
        width: iconSize + 16, height: iconSize + 16, borderRadius: (iconSize + 16) / 2,
        background: 'var(--bg-subtle)', color: 'var(--fg-faint)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={iconSize} />
      </div>
      <div style={{ fontSize: size === 'inline' ? 13.5 : 15, fontWeight: 600, color: 'var(--fg)' }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: size === 'inline' ? 12 : 13, color: 'var(--fg-muted)', maxWidth: 360, lineHeight: 1.5 }}>
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  code?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}
export function ErrorState({ code, title, description, action }: ErrorStateProps) {
  return (
    <div className="bira" style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 32, background: 'var(--bg-subtle)',
    }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        {code && (
          <div className="mono" style={{
            fontSize: 12, fontWeight: 600, color: 'var(--fg-faint)',
            textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
          }}>
            Error · {code}
          </div>
        )}
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{title}</h2>
        {description && (
          <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: '8px 0 18px', lineHeight: 1.55 }}>
            {description}
          </p>
        )}
        {action}
      </div>
    </div>
  );
}

/** Simple skeleton row used for loading states. */
export function SkeletonRow({ width = '100%', height = 12 }: { width?: number | string; height?: number | string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block', width, height,
        borderRadius: 4, background: 'var(--bg-muted)',
      }}
    />
  );
}
