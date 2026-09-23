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
