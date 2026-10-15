import { useRef } from 'preact/hooks';
import { Modal } from './Modal';

interface PromptDialogProps {
  open: boolean;
  title: string;
  label: string;
  initialValue: number;
  min: number;
  max: number;
  step: number;
  onConfirm: (value: number) => void;
  onCancel: () => void;
}

/** Single numeric-field dialog (gain, normalize target, …). */
export function PromptDialog({
  open,
  title,
  label,
  initialValue,
  min,
  max,
  step,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  // F-11 (v2): UNCONTROLLED input — the DOM owns the value while open and
  // confirm reads it live. A controlled `value` here lets ANY concurrent
  // render restore the stale vnode value inside the fill/keystroke→input
  // event gap, silently reverting what the user typed (reproduced 2026-10-15:
  // applied "chorus" while the field showed "bridge", ~2/6 attempts).
  // Initialization happens in the ref callback — synchronous with the commit
  // that makes the dialog visible, so it can never race a fast fill (an
  // effect-based init overwrote programmatic fills in e2e).
  const inputRef = useRef<HTMLInputElement>(null);
  const initRef = useRef(false);

  if (!open) {
    initRef.current = false;
    return null;
  }

  const attach = (el: HTMLInputElement | null): void => {
    inputRef.current = el;
    if (el && !initRef.current) {
      el.value = String(initialValue);
      initRef.current = true;
    }
  };

  const confirm = (): void => {
    const live = inputRef.current?.value ?? '';
    const parsed = Number(live);
    if (Number.isFinite(parsed) && live.trim() !== '') {
      onCancel();
      onConfirm(Math.max(min, Math.min(max, parsed)));
    }
  };

  return (
    <Modal title={title} onClose={onCancel}>
      <div class="url-form">
        <label class="url-hint" for="prompt-value">
          {label}
        </label>
        <input
          id="prompt-value"
          ref={attach}
          class="url-input"
          type="number"
          min={min}
          max={max}
          step={step}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm();
          }}
        />
        <div class="url-actions">
          <button class="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button class="btn-primary" onClick={confirm}>
            Apply
          </button>
        </div>
      </div>
    </Modal>
  );
}


interface TextPromptDialogProps {
  open: boolean;
  title: string;
  label: string;
  initialValue: string;
  maxLength: number;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/** Single text-field dialog (marker names, …). PF-01. */
export function TextPromptDialog({
  open,
  title,
  label,
  initialValue,
  maxLength,
  onConfirm,
  onCancel,
}: TextPromptDialogProps) {
  // F-11 (v2): uncontrolled — same rationale + ref-callback init as above.
  const inputRef = useRef<HTMLInputElement>(null);
  const initRef = useRef(false);

  if (!open) {
    initRef.current = false;
    return null;
  }

  const attach = (el: HTMLInputElement | null): void => {
    inputRef.current = el;
    if (el && !initRef.current) {
      el.value = initialValue;
      initRef.current = true;
    }
  };

  const confirm = (): void => {
    const live = inputRef.current?.value ?? '';
    const clean = live.trim().slice(0, maxLength);
    if (clean) {
      onCancel();
      onConfirm(clean);
    }
  };

  return (
    <Modal title={title} onClose={onCancel}>
      <div class="url-form">
        <label class="url-hint" for="text-prompt-value">
          {label}
        </label>
        <input
          id="text-prompt-value"
          ref={attach}
          class="url-input"
          type="text"
          maxlength={maxLength}
          onFocus={(e) => (e.target as HTMLInputElement).select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm();
          }}
        />
        <div class="url-actions">
          <button class="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button class="btn-primary" onClick={confirm}>
            Apply
          </button>
        </div>
      </div>
    </Modal>
  );
}
