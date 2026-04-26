// Shared modal shell. Handles the bits every modal needs:
//   - backdrop click → close
//   - Escape key → close
//   - body scroll lock while open
//   - role="dialog" + aria-modal for screen readers
//
// Composition is left to the caller — drop in `<ModalHeader>`, `<ModalBody>`,
// `<ModalFooter>` for the common shape, or render arbitrary content inside.
//
// Note: this is for true full-screen overlays. The create-issue route renders
// a modal-shaped *page* (occupying the route slot rather than overlaying the
// whole window) and intentionally doesn't use this shell.

import { useEffect, type FormEvent, type ReactNode } from 'react';
import { Icon } from './icons';

interface ModalProps {
  /** Called when the user dismisses (Escape, backdrop click, or close button). */
  onClose: () => void;
  /** Card content. */
  children: ReactNode;
  /** Card max width in px. Default 480. */
  maxWidth?: number;
  /**
   * Cap the card height so a long body can scroll while header/footer stay
   * pinned. The caller's body should set `flex: 1; overflow: auto;`.
   * Pass any CSS length (e.g. '88vh', 600).
   */
  maxHeight?: number | string;
  /** Vertical placement. Default 'center'; 'top' is right for pickers / command palettes. */
  align?: 'center' | 'top';
  /** Wraps the card in a <form> with this submit handler. */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  /** Override the backdrop z-index. Default 60 (above sidebar/topbar). */
  zIndex?: number;
  /** Accessible label for the dialog. */
  label?: string;
}

export function Modal({
  onClose, children, maxWidth = 480, maxHeight, align = 'center',
  onSubmit, zIndex = 60, label,
}: ModalProps) {
  // Escape dismiss + body-scroll lock while open. The lock prevents the page
  // behind the modal from scrolling on macOS-style trackpads.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  const card: React.CSSProperties = {
    width: '100%', maxWidth, background: 'var(--bg)',
    borderRadius: 10, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
    ...(maxHeight !== undefined ? {
      maxHeight, display: 'flex', flexDirection: 'column' as const,
    } : {}),
  };

  const inside = onSubmit ? (
    <form
      onSubmit={onSubmit}
      onClick={stopProp}
      role="dialog"
      aria-modal
      aria-label={label}
      style={card}
    >
      {children}
    </form>
  ) : (
    <div
      onClick={stopProp}
      role="dialog"
      aria-modal
      aria-label={label}
      style={card}
    >
      {children}
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex,
        background: 'rgba(15,23,42,.4)',
        display: 'flex',
        alignItems: align === 'top' ? 'flex-start' : 'center',
        justifyContent: 'center',
        padding: align === 'top' ? '10vh 24px' : 24,
      }}
    >
      {inside}
    </div>
  );
}

interface ModalHeaderProps {
  title: ReactNode;
  onClose?: () => void;
  /** Extra content rendered between the title and the close button. */
  extras?: ReactNode;
}
export function ModalHeader({ title, onClose, extras }: ModalHeaderProps) {
  return (
    <div style={{
      padding: '14px 18px', borderBottom: '1px solid var(--border-muted)',
      display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
    }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
      <div style={{ flex: 1 }} />
      {extras}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="btn btn-ghost btn-sm"
          style={{ width: 24, padding: 0 }}
          data-tip="Close"
          aria-label="Close"
        >
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
}

interface ModalBodyProps {
  children: ReactNode;
  padding?: number | string;
}
export function ModalBody({ children, padding = 18 }: ModalBodyProps) {
  return <div style={{ padding }}>{children}</div>;
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div style={{
      padding: '10px 18px', borderTop: '1px solid var(--border-muted)',
      background: 'var(--bg-subtle)',
      display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
    }}>
      {children}
    </div>
  );
}
