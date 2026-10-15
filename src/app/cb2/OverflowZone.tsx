/**
 * Overflow zone (CB-2.4 → CB-5.1): the ⋮ trigger opens either the plain
 * registry-command menu (everything inline) or, when zones are tucked
 * (CB-D19), a dialog panel hosting the relocated zones plus the same
 * command menu — so every control stays reachable and editable at any
 * container width. The trigger itself is never tucked.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { commands } from '../commands';
import { t } from '../../i18n';
import type { ComponentChildren } from 'preact';

const OVERFLOW_IDS = ['view.follow', 'record.monitor', 'record.clipReset'] as const;

export interface TuckState {
  master: boolean;
  record: boolean;
  tempo: boolean;
  selection: boolean;
  tool: boolean;
}

export function OverflowZone({
  tucked,
  children,
}: {
  tucked?: TuckState;
  children?: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const hasZones =
    tucked !== undefined &&
    (tucked.master || tucked.record || tucked.tempo || tucked.selection || tucked.tool);

  useEffect(() => {
    if (!open) return;
    // pointerdown (not click): closes on PRESS like a native menu, and is
    // immune to the click-retargeting that canvas selection drags cause
    // (mousedown/up on different nodes → click at a far ancestor — the
    // panel then never saw the click; found via the cb5 Escape/close race).
    const onDocPointer = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Capture-phase Escape: fires regardless of where focus lands (the
    // panel focus effect runs a commit later — an element-level handler
    // can miss an Escape that arrives in that gap; cb5.spec race).
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false); // focus restoration is the open-transition effect's job
      }
    };
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Dialog-mode open: focus the panel so Escape reaches its handler.
  useEffect(() => {
    if (open && hasZones) panelRef.current?.focus();
  }, [open, hasZones]);

  // Deterministic focus restoration on ANY close path (Escape, outside
  // press, command run): the commit is done, so the unmount cannot steal
  // the focus back off the trigger.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) btnRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const items = OVERFLOW_IDS.map((id) => commands.find((c) => c.id === id)).filter(
    (c): c is (typeof commands)[number] => c !== undefined,
  );

  const menu = (
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
  );

  return (
    <div class="cb2-overflow" ref={rootRef} data-testid="cb2-overflow-root">
      <button
        ref={btnRef}
        class="tbtn cb2-overflow-btn"
        data-testid="cb2-overflow"
        aria-haspopup={hasZones ? 'dialog' : 'menu'}
        aria-expanded={open}
        aria-label={t().moreTools}
        title={t().moreTools}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          // fallback for the pre-commit window: an Escape between the
          // click and the document-capture effect would otherwise be lost
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        ⋮
      </button>
      {open &&
        (hasZones ? (
          <div
            ref={panelRef}
            class="cb2-pop"
            data-testid="cb2-panel"
            role="dialog"
            aria-label={t().moreTools}
            tabIndex={-1}
          >
            <div class="cb2-pop-zones">{children}</div>
            <div class="cb2-pop-sep" role="separator" />
            {menu}
          </div>
        ) : (
          menu
        ))}
    </div>
  );
}
