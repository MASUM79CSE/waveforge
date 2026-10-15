/**
 * Overflow zone (CB-2.4 skeleton): a ⋮ menu that hosts registry commands —
 * in later phases the priority-collapse logic moves zone controls here at
 * narrow widths; in Phase 2 it carries the first real residents (follow
 * playhead, input monitor, clip-reset — controls with no v2 zone yet).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { commands } from '../commands';
import { t } from '../../i18n';

const OVERFLOW_IDS = ['view.follow', 'record.monitor', 'record.clipReset'] as const;

export function OverflowZone() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const items = OVERFLOW_IDS.map((id) => commands.find((c) => c.id === id)).filter(
    (c): c is (typeof commands)[number] => c !== undefined,
  );

  return (
    <div class="cb2-overflow" ref={rootRef} data-testid="cb2-overflow-root">
      <button
        class="tbtn cb2-overflow-btn"
        data-testid="cb2-overflow"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t().moreTools}
        title={t().moreTools}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        ⋮
      </button>
      {open && (
        <div class="cb2-menu" role="menu" aria-label={t().moreTools}>
          {items.map((cmd) => (
            <button
              key={cmd.id}
              role={cmd.check ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={cmd.check ? cmd.isChecked?.() : undefined}
              class="cb2-menu-item"
              data-testid={`cb2-overflow-${cmd.id.replace('.', '-')}`}
              onClick={() => {
                cmd.run();
                setOpen(false);
              }}
            >
              {cmd.label()}
              {cmd.kbd ? ` (${cmd.kbd()})` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
