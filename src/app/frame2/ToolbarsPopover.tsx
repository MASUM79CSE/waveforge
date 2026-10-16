/**
 * ToolbarsPopover (UX-3.2 DOM) — per-group show/hide + Reset layout, driven
 * ENTIRELY through registry commands (`view.toolbars.*`, `view.layoutReset`,
 * opened by `help.toolbars`). Keyboard: arrows move, Enter/Space toggles,
 * Escape closes; click-outside closes. Flag-ON only (mounted by Frame2).
 */
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { t } from '../../i18n';
import { runCommand } from '../commands';
import { FRAME2_TOOLBAR_GROUPS, resetLayout, toolbarsPopoverOpen, visibility } from './visibilityStore';
import type { Frame2ToolbarGroup } from './visibility';

const LABEL_KEYS: Record<Frame2ToolbarGroup, 'tbTransport' | 'tbEdit' | 'tbTools' | 'tbTimenap' | 'tbMeters'> = {
  transport: 'tbTransport',
  edit: 'tbEdit',
  tools: 'tbTools',
  timenap: 'tbTimenap',
  meters: 'tbMeters',
};

export function ToolbarsPopover() {
  const open = toolbarsPopoverOpen.value;
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus: boolean) => {
    toolbarsPopoverOpen.value = false;
    if (refocus) btnRef.current?.focus();
  }, []);

  const placeFixed = useCallback((): void => {
    const pop = popRef.current;
    const btn = btnRef.current;
    if (!pop || !btn) return;
    const r = btn.getBoundingClientRect();
    pop.style.top = `${r.bottom + 4}px`;
    const width = pop.offsetWidth || 200;
    pop.style.left = `${Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))}px`;
  }, []);

  useEffect(() => {
    if (open) placeFixed();
  }, [open, placeFixed]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent): void => {
      if (!popRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        toolbarsPopoverOpen.value = false;
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const onKey = useCallback(
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
    <span class="f2-toolbars">
      <button
        ref={btnRef}
        type="button"
        class="f2-btn f2-toolbars-btn"
        data-testid="toolbars-button"
        aria-label={t().viewToolbars}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => runCommand('help.toolbars')}
      >
        ⚙
      </button>
      {open && (
        <div class="f2-overflow-pop f2-pop-fixed f2-toolbars-pop" role="menu" aria-label={t().viewToolbars} ref={popRef} onKeyDown={onKey as (e: KeyboardEvent) => void}>
          {FRAME2_TOOLBAR_GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              role="menuitemcheckbox"
              aria-checked={visibility.value[g]}
              tabIndex={-1}
              data-testid={`toolbars-toggle-${g}`}
              onClick={() => runCommand(`view.toolbars.${g}`)}
            >
              <span aria-hidden="true">{visibility.value[g] ? '☑' : '☐'}</span> {t()[LABEL_KEYS[g]]}
            </button>
          ))}
          <div class="menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            data-testid="toolbars-reset"
            onClick={() => {
              resetLayout();
              close(true);
            }}
          >
            {t().viewLayoutReset}
          </button>
        </div>
      )}
    </span>
  );
}
