import { useState, useEffect } from 'preact/hooks';
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
  const [value, setValue] = useState(String(initialValue));

  useEffect(() => {
    if (open) setValue(String(initialValue));
  }, [open, initialValue]);

  if (!open) return null;

  const confirm = (): void => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
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
          class="url-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
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
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  if (!open) return null;

  const confirm = (): void => {
    const clean = value.trim().slice(0, maxLength);
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
          class="url-input"
          type="text"
          maxlength={maxLength}
          value={value}
          onFocus={(e) => (e.target as HTMLInputElement).select()}
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
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
