/**
 * Switchable clock (CB-2.2): time (default) · samples · bars+beats (only
 * when a tempo is known). One readout, one format at a time; the format
 * affordance lives ON the clock (benchmarks S1/S3/S5). Tabular figures +
 * a fixed character slot keep the row jitter-free (E-CB-007 hardening).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { bpmResult, cursorPos, docInfo } from '../state';
import { fmtClock } from '../../core/format';
import { fmtSamples, fmtBarsBeats } from '../../core/clock';
import { t } from '../../i18n';
import { clockFormat, clockMenuItems, setClockFormat, type ClockFormat } from './clockState';

export function Clock() {
  const doc = docInfo.value;
  const bpm = bpmResult.value;
  const format = clockFormat.value;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // close on outside click / Escape while the menu is open
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => {
      document.removeEventListener('click', onDocClick);
    };
  }, [open]);

  const sec = cursorPos.value;
  const sr = doc?.sampleRate ?? 44100;
  const text =
    format === 'samples'
      ? fmtSamples(sec, sr)
      : format === 'bars' && bpm
        ? fmtBarsBeats(sec, bpm.bpm)
        : fmtClock(sec);

  const pick = (id: ClockFormat): void => {
    setClockFormat(id);
    setOpen(false);
    rootRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  };

  const onMenuKey = (e: KeyboardEvent): void => {
    const items = clockMenuItems(bpm !== null).filter((i) => i.show);
    const idx = items.findIndex((i) => i.id === clockFormat.value);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const next = items[(idx + 1) % items.length] ?? items[0];
      if (next) setClockFormat(next.id);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = items[(idx - 1 + items.length) % items.length] ?? items[0];
      if (next) setClockFormat(next.id);
    }
  };

  return (
    <div class="cb2-clock" ref={rootRef} data-testid="cb2-clock-root">
      <span
        class="cb2-clock-readout"
        data-testid="cb2-clock"
        title={t().cursorPosition}
      >
        {text}
      </span>
      <button
        class="cb2-clock-fmt"
        data-testid="cb2-clock-format"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t().clockFormat}
        title={t().clockFormat}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          } else if (e.key === 'Escape') {
            // on the trigger (focused while open) — deterministic even when
            // pressed before the outside-click effect attaches
            if (open) {
              e.stopPropagation();
              setOpen(false);
            }
          }
        }}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>
      {open && (
        <div
          class="cb2-menu"
          role="menu"
          aria-label={t().clockFormat}
          ref={menuRef}
          onKeyDown={onMenuKey}
        >
          {clockMenuItems(bpm !== null)
            .filter((i) => i.show)
            .map((item) => (
              <button
                key={item.id}
                role="menuitemradio"
                aria-checked={clockFormat.value === item.id}
                class="cb2-menu-item"
                onClick={() => pick(item.id)}
              >
                {item.id === 'bars' ? `${t()[item.labelKey]} (4/4)` : t()[item.labelKey]}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
