/**
 * Control Bar v2 selection zone (CB-3.1): Start / End / Length as EDITABLE,
 * validated numeric fields (F-07; benchmarks S3/S4). Commits route through
 * the canonical selectRange() — the same snap pipeline as canvas selections
 * (ADR 007). Invalid input shows an inline error; the authoritative value
 * re-renders from the signal (controlled drafts — no F-11 read-back).
 */
import { useEffect, useState } from 'preact/hooks';
import { cursorPos, docInfo, selection } from '../state';
import { selectRange } from '../runtime';
import { runCommand } from '../commands';
import { cmdTitle } from './tooltips';
import { parseClockInput } from '../../core/clock';
import { fmtClock } from '../../core/format';
import { t } from '../../i18n';
import { Zone } from '../components/Zone';
import { useRovingToolbar } from './useRovingToolbar';

type Field = 'start' | 'end' | 'length';

export function SelectionZone() {
  const doc = docInfo.value;
  const sel = selection.value;
  const [draft, setDraft] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const roving = useRovingToolbar();

  // clear drafts + errors when the selection changes from elsewhere
  // (canvas, Ctrl+A, commands) — fields re-sync to the signal.
  useEffect(() => {
    setDraft({});
    setError(null);
  }, [sel?.start, sel?.end, sel === null]);

  const show = (field: Field): string => {
    const d = draft[field];
    if (d !== undefined) return d;
    if (!sel) return '-';
    if (field === 'start') return fmtClock(sel.start);
    if (field === 'end') return fmtClock(sel.end);
    return fmtClock(Math.max(0, sel.end - sel.start));
  };

  const commit = (field: Field, domValue?: string): void => {
    // H-sweep hardening: when the field was edited, the DOM text is the
    // authority (a programmatic fill or IME batch can land after the React
    // closure was captured — commit what the field actually shows). An
    // untouched field keeps the old semantics so blur never re-snaps.
    const raw = draft[field] !== undefined && domValue !== undefined ? domValue : draft[field];
    if (raw === undefined || raw.trim() === '') {
      setDraft({});
      setError(null);
      return;
    }
    const v = parseClockInput(raw);
    if (v === null) {
      setError(t().selInvalid);
      return;
    }
    const anchor = sel ? sel.start : cursorPos.value;
    if (field === 'start') selectRange(v, sel ? sel.end : v);
    else if (field === 'end') selectRange(sel ? sel.start : anchor, v);
    else selectRange(anchor, anchor + v);
    setDraft({});
    setError(null);
  };

  const onKey = (field: Field) => (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(field, (e.currentTarget as HTMLInputElement).value);
    } else if (e.key === 'Escape') {
      setDraft({});
      setError(null);
    }
  };

  return (
    <Zone label="Selection">
      <div
        class="cb2-selgroup"
        role="group"
        aria-label={t().selZone}
        data-testid="cb2-selection"
        ref={roving.ref}
        onKeyDown={roving.onKeyDown}
        onFocusIn={roving.onFocusIn}
      >
        <span class="sel-cell">
          <label class="sel-label" for="cb2-sel-start">
            {t().selStart}:
          </label>
          <input
            id="cb2-sel-start"
            class="sel-val cb2-sel-in"
            type="text"
            size={7}
            autocomplete="off"
            spellcheck={false}
            disabled={!doc}
            value={show('start')}
            tabIndex={0}
            data-testid="cb2-sel-start"
            aria-invalid={error !== null && draft['start'] !== undefined ? true : undefined}
            onInput={(e) => setDraft({ ...draft, start: (e.target as HTMLInputElement).value })}
            onKeyDown={onKey('start')}
            onBlur={(e) => commit('start', (e.target as HTMLInputElement).value)}
          />
        </span>
        <span class="sel-cell">
          <label class="sel-label" for="cb2-sel-end">
            {t().selEnd}:
          </label>
          <input
            id="cb2-sel-end"
            class="sel-val cb2-sel-in"
            type="text"
            size={7}
            autocomplete="off"
            spellcheck={false}
            disabled={!doc}
            value={show('end')}
            tabIndex={-1}
            data-testid="cb2-sel-end"
            aria-invalid={error !== null && draft['end'] !== undefined ? true : undefined}
            onInput={(e) => setDraft({ ...draft, end: (e.target as HTMLInputElement).value })}
            onKeyDown={onKey('end')}
            onBlur={(e) => commit('end', (e.target as HTMLInputElement).value)}
          />
        </span>
        <span class="sel-cell">
          <label class="sel-label" for="cb2-sel-length">
            {t().selLength}:
          </label>
          <input
            id="cb2-sel-length"
            class="sel-val cb2-sel-in"
            type="text"
            size={7}
            autocomplete="off"
            spellcheck={false}
            disabled={!doc}
            value={show('length')}
            tabIndex={-1}
            data-testid="cb2-sel-length"
            aria-invalid={error !== null && draft['length'] !== undefined ? true : undefined}
            onInput={(e) => setDraft({ ...draft, length: (e.target as HTMLInputElement).value })}
            onKeyDown={onKey('length')}
            onBlur={(e) => commit('length', (e.target as HTMLInputElement).value)}
          />
        </span>
        <button
          class="sel-clear"
          tabIndex={-1}
          title={cmdTitle('edit.deselect')}
          aria-label={cmdTitle('edit.deselect')}
          disabled={!sel}
          onClick={() => runCommand('edit.deselect')}
        >
          ✕
        </button>
      </div>
      {error !== null && (
        <span class="cb2-sel-error" role="status" data-testid="cb2-sel-error">
          {error}
        </span>
      )}
    </Zone>
  );
}
