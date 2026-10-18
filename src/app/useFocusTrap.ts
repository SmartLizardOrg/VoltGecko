import { useEffect, type RefObject } from 'react';

/** Keep keyboard navigation inside the active dialog and restore its opener. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: string | null, initialSelector?: string) {
  useEffect(() => {
    const region = active ? ref.current : null;
    if (!region) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () =>
      Array.from(
        region.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
        )
      ).filter((element) => element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => {
      const preferred = initialSelector ? region.querySelector<HTMLElement>(initialSelector) : null;
      (preferred ?? focusable()[0] ?? region).focus();
    });
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = focusable(),
        first = controls[0],
        last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        region.focus();
        return;
      }
      if (event.shiftKey && (document.activeElement === first || !region.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !region.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', trapFocus);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [ref, active, initialSelector]);
}
