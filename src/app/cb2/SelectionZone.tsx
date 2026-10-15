/**
 * Control Bar v2 selection zone (CB-3.1): Start / End / Length as EDITABLE,
 * validated numeric fields (F-07; benchmarks S3/S4). Commits route through
 * the canonical selectRange() — the same snap pipeline as canvas selections
 * (ADR 007). Invalid input shows an inline error.
 *
 * F-11 root pattern (CB-D14 precedent, third application): the fields are
 * UNCONTROLLED — the DOM owns the text while editing, initialization runs
 * in the ref callback, commit reads the live value, and external selection
 * changes sync through an effect that never touches a focused field. A
 * controlled `value` here let a stale render REVERT the DOM between a fill
 * and Enter (observed: commit 0:00.500 landed as 0:00.400 — E-CB-019).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
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
const FIELDS: Field[] = ['start', 'end', 'length'];

export function SelectionZone() {
  const doc = docInfo.value;
  const sel = selection.value;
  const [error, setError] = useState<string | null>(null);
  const roving = useRovingToolbar();
  const inputs = useRef<Partial<Record<Field, HTMLInputElement>>>({});
  const inited = useRef<Partial<Record<Field, boolean>>>({});
  // "edited" flags live in a REF on purpose: commit runs from keydown/blur
  // events that can precede the render triggered by onInput — a React-state
  // flag was read stale (fill+Enter inside one commit gap), the ref is not.
  const dirty = useRef<Partial<Record<Field, boolean>>>({});
  const [, bumpDirty] = useState(0); // re-render only for aria-invalid

  const show = (field: Field): string => {
    if (!sel) return '-';
    if (field === 'start') return fmtClock(sel.start);
    if (field === 'end') return fmtClock(sel.end);
    return fmtClock(Math.max(0, sel.end - sel.start));
  };

  /** Ref callback: synchronous first-value init (cannot race a fill). */
  const attach = (field: Field) => (el: HTMLInputElement | null) => {
    inputs.current[field] = el ?? undefined;
    if (el && !inited.current[field]) {
      el.value = show(field);
      inited.current[field] = true;
    }
  };

  // External selection changes (canvas, Ctrl+A, commands) rewrite every
  // field the user is NOT editing; drafts from elsewhere are stale.
  useEffect(() => {
    let active: Field | undefined;
    for (const f of FIELDS) {
      const el = inputs.current[f];
      if (!el) continue;
      if (document.activeElement === el) active = f;
      else el.value = show(f);
    }
    // Keep the "edited" flag for the field under the caret so an external
    // selection change landing between a fill and Enter cannot demote it —
    // but only when its text actually differs from the authoritative value:
    // right after a commit the DOM IS the canonical value, and re-marking
    // it dirty made the later blur re-commit (selection drift, E-CB-019).
    const edited =
      active && inputs.current[active] && inputs.current[active]!.value !== show(active);
    dirty.current = edited ? { [active!]: true } : {};
    setError(null);
    bumpDirty((n) => n + 1);
  }, [sel?.start, sel?.end, sel === null]);

  const canonical = (field: Field, r: { start: number; end: number }): string =>
    field === 'start'
      ? fmtClock(r.start)
      : field === 'end'
        ? fmtClock(r.end)
        : fmtClock(Math.max(0, r.end - r.start));

  const commit = (field: Field): void => {
    const el = inputs.current[field];
    const raw = el?.value ?? '';
    if (!dirty.current[field] || raw.trim() === '') {
      // untouched field: blur/Enter must never re-snap an existing selection
      if (el && raw.trim() === '') el.value = show(field);
      dirty.current[field] = undefined;
      setError(null);
      bumpDirty((n) => n + 1);
      return;
    }
    const v = parseClockInput(raw);
    if (v === null) {
      setError(t().selInvalid);
      return;
    }
    const anchor = sel ? sel.start : cursorPos.value;
    let r: { start: number; end: number } | null = null;
    if (field === 'start') r = selectRange(v, sel ? sel.end : v);
    else if (field === 'end') r = selectRange(sel ? sel.start : anchor, v);
    else r = selectRange(anchor, anchor + v);
    if (el && r) el.value = canonical(field, r); // show the SNAPPED result
    dirty.current[field] = undefined;
    setError(null);
    bumpDirty((n) => n + 1);
  };

  const onKey = (field: Field) => (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(field);
    } else if (e.key === 'Escape') {
      // revert the field to the authoritative value, drop the draft
      const el = inputs.current[field];
      if (el) el.value = show(field);
      dirty.current[field] = undefined;
      setError(null);
      bumpDirty((n) => n + 1);
    }
  };

  const cell = (field: Field, label: string, tabIndex: number) => (
    <span class="sel-cell">
      <label class="sel-label" for={`cb2-sel-${field}`}>
        {label}:
      </label>
      <input
        id={`cb2-sel-${field}`}
        class="sel-val cb2-sel-in"
        type="text"
        size={7}
        autocomplete="off"
        spellcheck={false}
        disabled={!doc}
        tabIndex={tabIndex}
        data-testid={`cb2-sel-${field}`}
        aria-invalid={error !== null && dirty.current[field] ? true : undefined}
        ref={attach(field)}
        onInput={() => {
          dirty.current[field] = true;
          bumpDirty((n) => n + 1);
        }}
        onKeyDown={onKey(field)}
        onBlur={() => commit(field)}
      />
    </span>
  );

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
        {cell('start', t().selStart, 0)}
        {cell('end', t().selEnd, -1)}
        {cell('length', t().selLength, -1)}
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
