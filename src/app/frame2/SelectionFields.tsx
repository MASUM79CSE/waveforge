/**
 * SelectionFields (UX-5.1) — the editable selection fields (frame2 only):
 * Start / End in the active format (S, MS default, HMS, SMP), derived
 * Duration readout. Enter commits, Escape reverts to the last committed
 * value (focus stays), invalid input never commits (aria-invalid + inline
 * message). Commits funnel through the SAME state the canvas drag writes
 * (S.selection + renderer.setSelection) — one selection path. Fields live
 * OUTSIDE any role=toolbar (arrow keys belong to the text inputs — APG
 * exclusion rule, INTERACTIONS.md §1). This is also the keyboard-selection
 * capability for the audio graph (§9: canvas never the only way).
 */
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cursorPos, docInfo, playing as playingSignal, selection as selectionSignal, type Selection } from '../state';
import { renderer } from '../runtime';
import { formatTimeField, parseTimeField, type TimeFieldMode } from '../../core/timeParse';
import { t } from '../../i18n';

const MODE_KEY = 'waveforge.frame2.timeFormat';
const MODES: TimeFieldMode[] = ['MS', 'S', 'HMS', 'SMP'];

function loadMode(): TimeFieldMode {
  try {
    const v = localStorage.getItem(MODE_KEY) as TimeFieldMode | null;
    return v && MODES.includes(v) ? v : 'MS';
  } catch {
    return 'MS';
  }
}

export function SelectionFields() {
  const doc = docInfo.value;
  const sel = selectionSignal.value;
  const [mode, setMode] = useState<TimeFieldMode>(loadMode);
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const sr = doc?.sampleRate ?? 48000;

  // mirror external (canvas-drag / keyboard) selection changes into the fields
  useEffect(() => {
    if (document.activeElement === startRef.current || document.activeElement === endRef.current) return;
    if (sel) {
      setStartText(formatTimeField(sel.start, mode, sr));
      setEndText(formatTimeField(sel.end, mode, sr));
    } else {
      setStartText('');
      setEndText('');
    }
    setError(null);
  }, [sel, mode, sr]);

  const commit = (): void => {
    if (!doc) return;
    const parseStart = parseTimeField(startText, mode, sr);
    const parseEnd = parseTimeField(endText, mode, sr);
    if (!parseStart.ok || !parseEnd.ok) {
      setError(t().selInvalid);
      if (!parseStart.ok) startRef.current?.setAttribute('aria-invalid', 'true');
      if (!parseEnd.ok) endRef.current?.setAttribute('aria-invalid', 'true');
      return;
    }
    if (parseStart.seconds === null && parseEnd.seconds === null) {
      selectionSignal.value = null;
      renderer.setSelection(null);
      setError(null);
      return;
    }
    const cur = selectionSignal.value;
    const rawStart = parseStart.seconds ?? cur?.start ?? 0;
    const rawEnd = parseEnd.seconds ?? cur?.end ?? doc.duration;
    const clamp = (v: number): number => Math.min(doc.duration, Math.max(0, v));
    const start = clamp(rawStart);
    const end = clamp(rawEnd);
    if (end < start) {
      setError(t().selOrder);
      return;
    }
    setError(null);
    startRef.current?.removeAttribute('aria-invalid');
    endRef.current?.removeAttribute('aria-invalid');
    const next: Selection = { start, end };
    selectionSignal.value = next;
    renderer.setSelection(next);
    // normalize the committed representation
    setStartText(formatTimeField(start, mode, sr));
    setEndText(formatTimeField(end, mode, sr));
  };

  const revert = (which: 'start' | 'end'): void => {
    const cur = selectionSignal.value;
    setStartText(cur ? formatTimeField(cur.start, mode, sr) : '');
    setEndText(cur ? formatTimeField(cur.end, mode, sr) : '');
    setError(null);
    (which === 'start' ? startRef.current : endRef.current)?.removeAttribute('aria-invalid');
  };

  const dur = sel ? sel.end - sel.start : null;

  const field = (which: 'start' | 'end'): JSX.Element => {
    const ref = which === 'start' ? startRef : endRef;
    const value = which === 'start' ? startText : endText;
    const setter = which === 'start' ? setStartText : setEndText;
    return (
      <span class="f2-selfield">
        <label class="sel-label" for={`f2-sel-${which}`}>
          {which === 'start' ? t().selStart : t().selEnd}
        </label>
        <input
          id={`f2-sel-${which}`}
          ref={ref}
          type="text"
          class="sel-val f2-sel-input"
          data-testid={`sel-${which}`}
          value={value}
          disabled={!doc}
          autoComplete="off"
          spellcheck={false}
          onInput={(e) => {
            setter((e.target as HTMLInputElement).value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              revert(which);
            }
          }}
        />
      </span>
    );
  };

  return (
    <span class="f2-section f2-selgroup" data-testid="f2-selgroup" role="group" aria-label={t().selGroupLabel}>
      <select
        class="f2-sel-mode"
        data-testid="sel-mode"
        aria-label={t().selFormat}
        value={mode}
        onChange={(e) => {
          const next = (e.target as HTMLSelectElement).value as TimeFieldMode;
          setMode(next);
          try {
            localStorage.setItem(MODE_KEY, next);
          } catch {
            /* private mode */
          }
        }}
      >
        <option value="MS">m:ss.mmm</option>
        <option value="S">s.mmm</option>
        <option value="HMS">h:mm:ss.mmm</option>
        <option value="SMP">{t().selSamples}</option>
      </select>
      {field('start')}
      {field('end')}
      <span class="f2-selfield">
        <span class="sel-label">{t().selDuration}</span>
        <span class="sel-val" data-testid="sel-dur">
          {dur === null ? '-' : formatTimeField(dur, mode, sr)}
        </span>
      </span>
      {error && (
        <span class="f2-sel-error" role="status">
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * CanvasSummary (§9) — visually-hidden live region describing the graph:
 * document, selection (active format), cursor when stopped. The canvas is
 * never the only way to read state.
 */
export function CanvasSummary() {
  const doc = docInfo.value;
  const sel = selectionSignal.value;
  const cur = cursorPos.value;
  const playing = playingSignal.value;
  const sr = doc?.sampleRate ?? 48000;

  const describe = (): string => {
    if (!doc) return t().noAudio;
    const selPart = sel
      ? `${t().summarySelection} ${formatTimeField(sel.start, 'MS', sr)} – ${formatTimeField(sel.end, 'MS', sr)}`
      : t().summaryNoSelection;
    const cursorPart = !playing && cur > 0 ? `, ${t().summaryCursor} ${formatTimeField(cur, 'MS', sr)}` : '';
    return `${doc.name}: ${selPart}${cursorPart}`;
  };

  return (
    <div class="visually-hidden" data-testid="f2-summary" aria-live="polite" role="status">
      {describe()}
    </div>
  );
}
