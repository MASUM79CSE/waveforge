import { useEffect, useState } from 'preact/hooks';
import type { ChainEntry } from '../../fx/chain';
import { parseChain } from '../../fx/chain';
import { defaultParams, getEffect, listEffects } from '../../fx/registry';
import { BUILTIN_CHAIN_PRESETS, chainPresetById } from '../../fx/presets';
import {
  deleteUserPreset,
  listUserPresets,
  loadUserPreset,
  saveUserPreset,
} from '../../storage/presetStore';
import { applyChain, prepareChainPreview, rackLabel } from '../fxChainActions';
import { startPreview, stopPreview, togglePreviewAB } from '../preview';
import { previewActive, rackOpen } from '../state';
import { closeFxRack, toastInfo } from '../actions';
import { ParamRow } from './EffectDialog';
import { Modal } from './Modal';
import { t } from '../../i18n';

/**
 * C2 — FX Rack (docs/fxchains-plan.md): ordered serial chain — add/remove/
 * reorder/bypass, params inline via the shared ParamRow; C3 presets (built-
 * in recipes + named user presets in IndexedDB) and chain JSON import/
 * export (Audacity-macro precedent). Apply = ONE history entry.
 */
export function FxRackDialog() {
  const [entries, setEntries] = useState<ChainEntry[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selected, setSelected] = useState('');
  const [presetName, setPresetName] = useState('');
  const [userPresets, setUserPresets] = useState<string[]>([]);

  useEffect(() => {
    if (!rackOpen.value) return;
    void listUserPresets()
      .then(setUserPresets)
      .catch(() => setUserPresets([]));
  }, [rackOpen.value]);

  if (!rackOpen.value) return null;

  const catalog = t() as unknown as Record<string, string>;
  const labelOf = (key: string, fallback: string): string => catalog[key] ?? fallback;

  const update = (next: ChainEntry[]): void => setEntries(next.map((e) => ({ ...e })));

  const setParam = (row: number, key: string, value: number | boolean): void => {
    const next = entries.map((e, i) => (i === row ? { ...e, params: { ...e.params, [key]: value } } : e));
    update(next);
  };
  const move = (row: number, delta: number): void => {
    const to = row + delta;
    if (to < 0 || to >= entries.length) return;
    const next = [...entries];
    [next[row], next[to]] = [next[to]!, next[row]!];
    update(next);
    if (expanded === row) setExpanded(to);
  };
  const remove = (row: number): void => {
    update(entries.filter((_, i) => i !== row));
    if (expanded === row) setExpanded(null);
  };
  const addEffect = (effectId: string): void => {
    const def = getEffect(effectId);
    if (!def) return;
    update([...entries, { effectId, params: defaultParams(def), bypass: false }]);
    setExpanded(entries.length);
  };

  const preview = (): Promise<void> =>
    prepareChainPreview(entries).then((plan) => {
      if (plan) startPreview(plan);
    });
  const restartPreviewIfLive = (): void => {
    if (!previewActive.value) return;
    stopPreview();
    void preview();
  };

  const onPreviewToggle = (): void => {
    if (previewActive.value) {
      stopPreview();
      return;
    }
    void preview();
  };

  const onApply = (): void => {
    stopPreview();
    closeFxRack();
    void applyChain(entries);
  };

  const loadPreset = (): void => {
    const [kind, ...rest] = selected.split(':');
    const name = rest.join(':');
    if (kind === 'builtin') {
      const preset = chainPresetById(name);
      if (preset) {
        update(preset.chain.map((e) => ({ ...e })));
        setExpanded(null);
      }
      return;
    }
    if (kind === 'user') {
      void loadUserPreset(name).then((json) => {
        if (json === undefined) return;
        const parsed = parseChain(JSON.parse(json));
        if (parsed.ok) {
          update(parsed.chain);
          setExpanded(null);
        } else {
          toastInvalid();
        }
      });
    }
  };

  const saveCurrent = (): void => {
    const name = presetName.trim();
    if (!name || entries.length === 0) return;
    void saveUserPreset(name, JSON.stringify(entries)).then(() =>
      listUserPresets()
        .then(setUserPresets)
        .catch(() => undefined),
    );
    setSelected(`user:${name}`);
    setPresetName('');
  };

  const deleteSelected = (): void => {
    if (!selected.startsWith('user:')) return;
    const name = selected.slice(5);
    void deleteUserPreset(name).then(() =>
      listUserPresets()
        .then(setUserPresets)
        .catch(() => undefined),
    );
    setSelected('');
  };

  const exportJson = (): void => {
    const blob = new Blob([JSON.stringify(entries)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chain.waveforge.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File): void => {
    void file.text().then((text) => {
      try {
        const parsed = parseChain(JSON.parse(text));
        if (!parsed.ok) {
          toastInvalid();
          return;
        }
        update(parsed.chain);
        setExpanded(null);
      } catch {
        toastInvalid();
      }
    });
  };

  const toastInvalid = (): void => toastInfo(t().rackImportFailed);

  return (
    <Modal title={rackLabel()} onClose={closeFxRack}>
      <div class="fx-dialog rack">
        <div class="rack-presets" data-testid="rack-presets">
          <span class="fx-label">{t().rackPresets}</span>
          <select
            value={selected}
            onChange={(e) => setSelected((e.target as HTMLSelectElement).value)}
          >
            <option value="">{t().rackPresetChoose}</option>
            <optgroup label={t().rackPresetsBuiltin}>
              {BUILTIN_CHAIN_PRESETS.map((p) => (
                <option key={p.id} value={`builtin:${p.id}`}>
                  {labelOf(p.nameKey, p.id)}
                </option>
              ))}
            </optgroup>
            <optgroup label={t().rackPresetsUser}>
              {userPresets.map((n) => (
                <option key={n} value={`user:${n}`}>
                  {n}
                </option>
              ))}
            </optgroup>
          </select>
          <button class="btn-secondary" disabled={!selected} onClick={loadPreset}>
            {t().rackPresetLoad}
          </button>
          <button
            class="btn-secondary"
            disabled={!selected.startsWith('user:')}
            onClick={deleteSelected}
          >
            {t().rackPresetDelete}
          </button>
          <input
            type="text"
            placeholder={t().rackPresetName}
            value={presetName}
            onInput={(e) => setPresetName((e.target as HTMLInputElement).value)}
          />
          <button
            class="btn-secondary"
            disabled={!presetName.trim() || entries.length === 0}
            onClick={saveCurrent}
          >
            {t().rackPresetSave}
          </button>
          <button class="btn-secondary" disabled={entries.length === 0} onClick={exportJson}>
            {t().rackExport}
          </button>
          <label class="btn-secondary rack-import">
            {t().rackImport}
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) importJson(file);
              }}
            />
          </label>
        </div>

        {entries.length === 0 && <p class="rack-empty">{t().rackEmpty}</p>}
        {entries.map((entry, i) => {
          const def = getEffect(entry.effectId);
          if (!def) return null;
          return (
            <div class="rack-block" key={`${entry.effectId}-${i}`} data-testid={`rack-row-${i}`}>
              <div class="rack-row">
                <button
                  class="rack-expand"
                  aria-label={`${effectLabelSafe(def.id)} ${expanded === i ? 'collapse' : 'expand'}`}
                  onClick={() => setExpanded(expanded === i ? null : i)}
                >
                  {expanded === i ? '▾' : '▸'}
                </button>
                <span class="rack-label">{effectLabelSafe(def.id)}</span>
                <label class="rack-bypass">
                  <input
                    type="checkbox"
                    checked={entry.bypass}
                    onChange={(e) =>
                      update(
                        entries.map((x, j) =>
                          j === i
                            ? { ...x, bypass: (e.target as HTMLInputElement).checked }
                            : x,
                        ),
                      )
                    }
                  />
                  {t().rackBypass}
                </label>
                <button class="rack-move" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button
                  class="rack-move"
                  disabled={i === entries.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button class="rack-remove" onClick={() => remove(i)}>
                  ✕
                </button>
              </div>
              {expanded === i && (
                <div class="rack-params">
                  {def.specs.map((spec) => (
                    <ParamRow
                      key={spec.key}
                      spec={spec}
                      value={entry.params[spec.key]}
                      onChange={(key, value) => {
                        setParam(i, key, value);
                        restartPreviewIfLive();
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div class="rack-add">
          <select id="rack-add-select" value="">
            <option value="">{t().rackAdd}</option>
            {listEffects().map((def) => (
              <option key={def.id} value={def.id}>
                {effectLabelSafe(def.id)}
              </option>
            ))}
          </select>
          <button
            class="btn-secondary"
            data-testid="rack-add"
            onClick={() => {
              const select = document.getElementById('rack-add-select') as HTMLSelectElement;
              if (select.value) {
                addEffect(select.value);
                select.value = '';
              }
            }}
          >
            {t().rackAddBtn}
          </button>
        </div>

        <div class="fx-actions">
          <button class="btn-secondary" disabled={entries.length === 0} onClick={onPreviewToggle}>
            {previewActive.value ? t().fxPreviewStop : t().fxPreviewAB}
          </button>
          {previewActive.value && (
            <button class="btn-secondary" onClick={() => void togglePreviewAB()}>
              A / B
            </button>
          )}
          <span class="fx-spacer" />
          <button class="btn-secondary" onClick={closeFxRack}>
            Cancel
          </button>
          <button class="btn-primary" data-testid="rack-apply" disabled={entries.length === 0} onClick={onApply}>
            {t().fxApply}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function effectLabelSafe(effectId: string): string {
  const def = getEffect(effectId);
  const catalog = t() as unknown as Record<string, string>;
  const label = def ? (catalog[def.labelKey] ?? def.id) : effectId;
  return label.replace(/…$/, '');
}
