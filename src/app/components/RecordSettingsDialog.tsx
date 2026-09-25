import { useEffect, useState } from 'preact/hooks';
import {
  discardLastTake,
  loadConstraints,
  loadStudio,
  saveConstraints,
  saveStudio,
  setMonitoring,
} from '../recordActions';
import { closeRecordSettings } from '../actions';
import { recordSettingsOpen, takes, type RecStudioSettings } from '../state';
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
  const [studio, setStudio] = useState<RecStudioSettings>(loadStudio());

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

  const updateStudio = (patch: Partial<RecStudioSettings>): void => {
    const next = { ...studio, ...patch };
    setStudio(next);
    saveStudio(next); // also applies monitoring live when armed
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
        <div class="fx-row fx-section-head">
          <span class="fx-label">{t().studioSection}</span>
        </div>
        <div class="fx-row">
          <label class="fx-label" for="record-countin">
            {t().studioCountIn}
          </label>
          <select
            id="record-countin"
            class="fx-num export-select"
            data-testid="countin-bars"
            value={String(studio.countInBars)}
            onChange={(e) => updateStudio({ countInBars: Number((e.target as HTMLSelectElement).value) })}
          >
            <option value="0">Off</option>
            <option value="1">1 bar</option>
            <option value="2">2 bars</option>
            <option value="3">3 bars</option>
            <option value="4">4 bars</option>
          </select>
        </div>
        <div class="fx-row">
          <label class="fx-label" for="record-metro">
            {t().studioMetronome}
          </label>
          <input
            id="record-metro"
            type="checkbox"
            data-testid="metronome-toggle"
            checked={studio.metronome}
            onChange={(e) => updateStudio({ metronome: (e.target as HTMLInputElement).checked })}
          />
        </div>
        <div class="fx-row">
          <label class="fx-label" for="record-bpm">
            {t().studioTempo}
          </label>
          <input
            id="record-bpm"
            class="fx-num"
            type="number"
            min={40}
            max={240}
            value={studio.manualBpm}
            data-testid="click-bpm"
            onChange={(e) =>
              updateStudio({ manualBpm: Number((e.target as HTMLInputElement).value) || 120 })
            }
          />
        </div>
        <div class="fx-row">
          <label class="fx-label" for="record-detbpm">
            {t().studioUseDetected}
          </label>
          <input
            id="record-detbpm"
            type="checkbox"
            checked={studio.useDetectedBpm}
            onChange={(e) => updateStudio({ useDetectedBpm: (e.target as HTMLInputElement).checked })}
          />
        </div>
        <div class="fx-row">
          <label class="fx-label" for="record-clickvol">
            {t().studioClickVolume}
          </label>
          <input
            id="record-clickvol"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={studio.clickVolume}
            onInput={(e) => updateStudio({ clickVolume: Number((e.target as HTMLInputElement).value) })}
          />
        </div>
        <div class="fx-row">
          <label class="fx-label" for="record-monitor">
            {t().studioMonitor}
          </label>
          <input
            id="record-monitor"
            type="checkbox"
            data-testid="studio-monitor"
            checked={studio.monitoring}
            onChange={(e) => setMonitoring((e.target as HTMLInputElement).checked)}
          />
        </div>
        {takes.value.takes.length > 0 && (
          <div class="fx-row takes-row" data-testid="takes-list">
            <span class="fx-label">{t().takesTitle}</span>
            <span class="takes-names">
              {takes.value.takes.map((take) => (
                <span key={take.id} class={`take-chip ${take.kept ? 'kept' : ''}`}>
                  {take.name}
                </span>
              ))}
            </span>
            <button class="btn-secondary" data-testid="take-discard" onClick={discardLastTake}>
              {t().takeDiscard}
            </button>
          </div>
        )}
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
