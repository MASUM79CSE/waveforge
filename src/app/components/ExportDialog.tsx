import { useState } from 'preact/hooks';
import {
  cancelExport,
  currentEstimate,
  defaultExportName,
  performExport,
} from '../exportActions';
import { closeExportDialog } from '../actions';
import {
  docInfo,
  exportBusy,
  exportOpen,
  exportProgress,
  metadataOpen,
  selection,
} from '../state';
import { t } from '../../i18n';
import { Modal } from './Modal';
import type { ExportFormat } from '../../io/exportName';

const MP3_RATES = ['128', '192', '256', '320'];
const FLAC_LEVELS = ['0', '3', '5', '8'];

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExportDialog() {
  const open = exportOpen.value;
  const doc = docInfo.value;
  // initial state is computed at mount — App mounts this dialog fresh for
  // every open (see <ExportDialog/> below), so no reset effect is needed
  const [format, setFormat] = useState<ExportFormat>('wav');
  const [quality, setQuality] = useState('pcm16');
  const [useSelection, setUseSelection] = useState(false);
  const [filename, setFilename] = useState(defaultExportName());

  if (!open) return null;

  const hasSelection = selection.value !== null;
  const setFormatAndQuality = (next: ExportFormat): void => {
    setFormat(next);
    setQuality(next === 'mp3' ? '192' : next === 'flac' ? '5' : 'pcm16');
  };
  const estimate = currentEstimate(format, useSelection && hasSelection ? quality : quality);

  return (
    <Modal title={t().exportTitle} onClose={closeExportDialog}>
      <div class="fx-dialog">
        <div class="fx-row">
          <label class="fx-label" for="export-format">
            {t().exportFormat}
          </label>
          <select
            id="export-format"
            class="fx-num export-select"
            value={format}
            onChange={(e) => setFormatAndQuality((e.target as HTMLSelectElement).value as ExportFormat)}
          >
            <option value="wav">{t().exportFormatWav}</option>
            <option value="mp3">{t().exportFormatMp3}</option>
            <option value="flac">{t().exportFormatFlac}</option>
          </select>
        </div>

        {format === 'wav' && (
          <div class="fx-row">
            <label class="fx-label" for="export-quality">
              {t().exportWavBits}
            </label>
            <select
              id="export-quality"
              class="fx-num export-select"
              value={quality}
              onChange={(e) => setQuality((e.target as HTMLSelectElement).value)}
            >
              <option value="pcm16">16-bit PCM</option>
              <option value="pcm24">24-bit PCM</option>
              <option value="float32">32-bit float</option>
            </select>
          </div>
        )}
        {format === 'mp3' && (
          <div class="fx-row">
            <label class="fx-label" for="export-quality">
              {t().exportMp3Bitrate}
            </label>
            <select
              id="export-quality"
              class="fx-num export-select"
              value={quality}
              onChange={(e) => setQuality((e.target as HTMLSelectElement).value)}
            >
              {MP3_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate} kbps
                </option>
              ))}
            </select>
          </div>
        )}
        {format === 'mp3' && (
          <div class="fx-row">
            <span class="fx-label" />
            <button
              type="button"
              class="btn-secondary"
              onClick={() => { metadataOpen.value = true; }}
            >
              {t().metadataSongInfo}
            </button>
          </div>
        )}
        {format === 'flac' && (
          <div class="fx-row">
            <label class="fx-label" for="export-quality">
              {t().exportFlacLevel}
            </label>
            <select
              id="export-quality"
              class="fx-num export-select"
              value={quality}
              onChange={(e) => setQuality((e.target as HTMLSelectElement).value)}
            >
              {FLAC_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
        )}

        <div class="fx-row">
          <label class="fx-label" for="export-scope">
            {t().exportScope}
          </label>
          <select
            id="export-scope"
            class="fx-num export-select"
            value={useSelection ? 'selection' : 'whole'}
            disabled={!hasSelection}
            onChange={(e) => setUseSelection((e.target as HTMLSelectElement).value === 'selection')}
          >
            <option value="whole">{t().exportScopeWhole}</option>
            <option value="selection" disabled={!hasSelection}>
              {t().exportScopeSelection}
            </option>
          </select>
        </div>

        <div class="fx-row">
          <label class="fx-label" for="export-name">
            {t().exportFilename}
          </label>
          <input
            id="export-name"
            class="fx-num export-name"
            type="text"
            value={filename}
            onInput={(e) => setFilename((e.target as HTMLInputElement).value)}
          />
          <span class="export-ext">.{format}</span>
        </div>

        <div class="export-meta">
          <span>
            {t().exportEstimate}: {formatBytes(estimate)}
          </span>
          {exportProgress.value !== null && (
            <span>{Math.round(exportProgress.value * 100)}%</span>
          )}
        </div>
        {exportProgress.value !== null && (
          <div class="export-bar">
            <div class="export-bar-fill" style={{ width: `${Math.round(exportProgress.value * 100)}%` }} />
          </div>
        )}

        <div class="fx-actions">
          <span class="fx-spacer" />
          {exportBusy.value ? (
            <button class="btn-secondary" onClick={() => cancelExport()}>
              {t().exportCancel}
            </button>
          ) : (
            <button class="btn-secondary" onClick={closeExportDialog}>
              Close
            </button>
          )}
          <button
            class="btn-primary"
            disabled={exportBusy.value || !doc}
            onClick={() => void performExport(format, quality, filename)}
          >
            {t().exportButton}
          </button>
        </div>
      </div>
    </Modal>
  );
}
