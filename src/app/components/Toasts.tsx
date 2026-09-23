import { toasts, type Toast } from '../state';
import { dismissToast } from '../actions';

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((toast) => (
        <ToastRow key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastRow({ toast }: { toast: Toast }) {
  return (
    <div class={`toast toast-${toast.kind}`}>
      <span class="toast-msg">{toast.message}</span>
      {toast.action && (
        <button class="toast-action" onClick={() => toast.action?.run()}>
          {toast.action.label}
        </button>
      )}
      <button class="toast-close" title="Dismiss" onClick={() => dismissToast(toast.id)}>
        ✕
      </button>
    </div>
  );
}
