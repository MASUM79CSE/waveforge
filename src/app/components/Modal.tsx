import type { ComponentChildren } from 'preact';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

/** Base dialog: overlay click + panel. Escape handled by the keyboard manager. */
export function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div
      class="modal-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="modal-panel" role="dialog" aria-modal="true" aria-label={title}>
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
