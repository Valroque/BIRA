// `useDismiss` — close-on-outside-click + close-on-Escape, using a passive
// listener pattern. Different from the invisible-fixed-overlay pattern that
// `<board.tsx>` GroupByMenu and `<board-config.tsx>` StatusPicker use; both
// patterns are valid and not conflated here.
//
// Usage:
//
//   const ref = useRef<HTMLDivElement>(null);
//   const [open, setOpen] = useState(false);
//   useDismiss(ref, () => setOpen(false), open);
//   return <div ref={ref}>…</div>;

import { useEffect, type RefObject } from 'react';

export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  open: boolean,
) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
    // `ref` and `onClose` are stable enough for the prototype; keeping the
    // dep list narrow avoids re-binding the listeners on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
