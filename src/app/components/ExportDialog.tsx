import { useState } from 'preact/hooks';
import {
  cancelExport,
  currentEstimate,
  defaultExportName,
  performExport,
  performProjectExport,
} from '../exportActions';
import { closeExportDialog } from '../actions';
import {
  docInfo,
  exportBusy,
  exportOpen,
  exportProgress,
  metadataOpen,
  selection,
  projectOpen,
} from '../state';
import { t } from '../../i18n';
import { Modal } from './Modal';
import { EXPORT_FORMATS, formatInfo, qualityHint } from '../../io/exportFormats';
import type { ExportFormat } from '../../io/exportName';

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
  const [quality, setQuality] = useState(formatInfo('wav').defaultQuality);
  const [useSelection, setUseSelection] = useState(false);
  const [filename, setFilename] = useState(defaultExportName());

  if (!open) return null;

  const hasSelection = selection.value !== null;
  const setFormatAndQuality = (next: ExportFormat): void => {
    setFormat(next);
    setQuality(formatInfo(next).defaultQuality);
  };
  const info = formatInfo(format);
  const estimate = currentEstimate(format, quality);

  return (
    <Modal title={t().exportTitle} onClose={closeExportDialog}>
      <div class="fx-dialog">
        <div class="export-cards" role="radiogroup" aria-label={t().exportFormat}>
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={format === f.id}
              class={`export-card ${format === f.id ? 'selected' : ''}`}
              data-testid={`export-format-${f.id}`}
              onClick={() => setFormatAndQuality(f.id)}
            >
              <span class="export-card-head">
                <span class="export-card-name">{f.name}</span>
                <span class={`export-card-badge ${f.badge === 'Lossless' ? 'ok' : 'warn'}`}>
                  {f.badge}
                </span>
              </span>
              <span class="export-card-blurb">{f.blurb}</span>
            </button>
          ))}
        </div>

        <div class="fx-row">
          <label class="fx-label" for="export-quality">
            {info.id === 'wav' ? t().exportWavBits : info.id === 'mp3' ? t().exportMp3Bitrate : t().exportFlacLevel}
          </label>
          <select
            id="export-quality"
            class="fx-num export-select"
            value={quality}
            onChange={(e) => setQuality((e.target as HTMLSelectElement).value)}
          >
            {info.qualities.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </select>
          <span class="export-hint">{qualityHint(format, quality)}</span>
        </div>

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
            {t().exportEstimate}: <strong>{formatBytes(estimate)}</strong>
          </span>
          {doc && <span>{t().exportSampleRate}: {doc.sampleRate} Hz</span>}
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
        {projectOpen.value && (
          <div class="fx-actions">
            <span class="lane-export-hint">{t().projectExportHint}</span>
            <span class="fx-spacer" />
            <button
              class="btn-secondary"
              disabled={exportBusy.value}
              onClick={() => void performProjectExport(format, quality, filename, 'mixdown')}
            >
              {t().projectMixdown}
            </button>
            <button
              class="btn-secondary"
              disabled={exportBusy.value}
              onClick={() => void performProjectExport(format, quality, filename, 'stems')}
            >
              {t().projectStems}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
