/**
 * OverflowMenu (UX-2.4 DOM wrapper) — the ⋯ popup for controls that did not
 * fit a band. Button keeps aria-expanded + aria-haspopup; popup is
 * role=menu; ArrowUp/Down move, Enter/Space activate, Escape closes and
 * returns focus to the button, click-outside closes. Items are (label,
 * action) pairs supplied by band definitions (Phase 3).
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

export interface OverflowEntry {
  id: string;
  label: string;
  action: () => void;
}

interface OverflowMenuProps {
  label: string;
  entries: OverflowEntry[];
}

export function OverflowMenu({ label, entries }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  // Fixed positioning: the band clips overflow, so the popup is placed in
  // viewport coordinates (same approach as the app's global tooltips).
  const placeFixed = useCallback(() => {
    const pop = popRef.current;
    const btn = btnRef.current;
    if (!pop || !btn) return;
    const r = btn.getBoundingClientRect();
    pop.style.top = `${r.bottom + 4}px`;
    const width = pop.offsetWidth || 180;
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    pop.style.left = `${left}px`;
  }, []);
  const onResize = useCallback(() => close(false), [close]);
  useEffect(() => {
    if (!open) return;
    placeFixed();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, placeFixed, onResize]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const onMenuKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = [...(popRef.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
      if (items.length === 0) return;
      const idx = items.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? (idx + 1 + items.length) % items.length : (idx - 1 + items.length) % items.length;
      items[next]?.focus();
    },
    [close],
  );

  return (
    <span class="f2-overflow">
      <button
        ref={btnRef}
        class="f2-overflow-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⋯
      </button>
      {open && (
        <div class="f2-overflow-pop f2-pop-fixed" role="menu" aria-label={label} ref={popRef} onKeyDown={onMenuKey as (e: KeyboardEvent) => void}>
          {entries.map((en) => (
            <button
              key={en.id}
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(true);
                en.action();
              }}
            >
              {en.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
