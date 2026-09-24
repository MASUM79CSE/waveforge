import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren, JSX } from 'preact';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function focusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !(el as HTMLButtonElement).disabled,
  );
}

/** Base dialog: overlay click + panel + a11y focus trap. Escape handled by the keyboard manager. */
export function Modal({ title, onClose, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus();
    return () => prev?.focus();
  }, []);

  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = focusables(panel);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      class="modal-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        class="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
        onKeyDown={onKeyDown}
      >
        <div class="modal-head">
          <span class="modal-title">{title}</span>
          <button class="modal-close" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}
