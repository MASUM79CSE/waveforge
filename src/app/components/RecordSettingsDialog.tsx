import { useEffect, useState } from 'preact/hooks';
import { loadConstraints, saveConstraints } from '../recordActions';
import { closeRecordSettings } from '../actions';
import { recordSettingsOpen } from '../state';
import { t } from '../../i18n';
import { Modal } from './Modal';
import type { MicConstraints } from '../../engine/recorder';

interface DeviceOption {
  deviceId: string;
  label: string;
}

/** Mic constraints + device picker, persisted to localStorage. */
export function RecordSettingsDialog() {
  const open = recordSettingsOpen.value;
  const [constraints, setConstraints] = useState<MicConstraints>(loadConstraints());
  const [devices, setDevices] = useState<DeviceOption[]>([]);

  useEffect(() => {
    if (!open) return;
    setConstraints(loadConstraints());
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((list) =>
        setDevices(
          list
            .filter((device) => device.kind === 'audioinput')
            .map((device, index) => ({
              deviceId: device.deviceId,
              label: device.label || `Microphone ${index + 1}`,
            })),
        ),
      )
      .catch(() => setDevices([]));
  }, [open]);

  if (!open) return null;

  const update = (patch: Partial<MicConstraints>): void => {
    const next = { ...constraints, ...patch };
    setConstraints(next);
    saveConstraints(next);
  };

  return (
    <Modal title={t().recordTitle} onClose={closeRecordSettings}>
      <div class="fx-dialog">
        <div class="fx-row">
          <label class="fx-label" for="record-device">
            {t().recordDevice}
          </label>
          <select
            id="record-device"
            class="fx-num export-select"
            value={constraints.deviceId ?? ''}
            onChange={(e) =>
              update({ deviceId: (e.target as HTMLSelectElement).value || undefined })
            }
          >
            <option value="">Default</option>
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>
        <div class="fx-row">
          <label class="fx-label" for="record-ec">
            {t().recordEchoCancel}
          </label>
          <input
            id="record-ec"
            type="checkbox"
            checked={constraints.echoCancellation}
            onChange={(e) => update({ echoCancellation: (e.target as HTMLInputElement).checked })}
          />
        </div>
        <div class="fx-row">
          <label class="fx-label" for="record-ns">
            {t().recordNoiseSuppression}
          </label>
          <input
            id="record-ns"
            type="checkbox"
            checked={constraints.noiseSuppression}
            onChange={(e) => update({ noiseSuppression: (e.target as HTMLInputElement).checked })}
          />
        </div>
        <div class="fx-row">
          <label class="fx-label" for="record-agc">
            {t().recordAutoGain}
          </label>
          <input
            id="record-agc"
            type="checkbox"
            checked={constraints.autoGainControl}
            onChange={(e) => update({ autoGainControl: (e.target as HTMLInputElement).checked })}
          />
        </div>
        <div class="fx-actions">
          <span class="fx-spacer" />
          <button class="btn-primary" onClick={closeRecordSettings}>
            {t().recordSave}
          </button>
        </div>
      </div>
    </Modal>
  );
}
