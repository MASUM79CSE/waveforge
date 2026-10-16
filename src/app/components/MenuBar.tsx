import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { foldMenuItems, menus } from '../menus';
import { menuStep, titleStep, typeaheadStep } from '../menubarNav';
import { commands, type Command } from '../commands';
import { Brand } from '../../brand';

export function MenuBar() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [rovedId, setRovedId] = useState(menus[0]?.id ?? '');
  const rootRef = useRef<HTMLDivElement>(null);
  // 'first' | 'last' when the menu was opened by keyboard — the dropdown
  // focuses the corresponding item once rendered (APG menubar pattern)
  const openFocus = useRef<'first' | 'last' | null>(null);

  const focusTitle = (id: string): void => {
    rootRef.current?.querySelector<HTMLButtonElement>(`[data-menu-id="${id}"]`)?.focus();
    setRovedId(id);
  };
  const openMenu = (id: string, focus: 'first' | 'last'): void => {
    openFocus.current = focus;
    setRovedId(id);
    setOpenId(id);
  };
  // true when the current menu was opened by hovering another title —
  // a click on the freshly-switched title must keep it open (native
  // menu behaviour), not toggle it straight back closed
  const hoverSwitched = useRef(false);

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenId(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);

  // APG menubar: roving titles (one tab stop), arrows switch titles —
  // opening the switched-to menu when one is already open (the keyboard
  // equivalent of the hover switch) — Down/Up open with first/last item.
  const onMenubarKey = (e: KeyboardEvent): void => {
    const btn = (e.target as HTMLElement).closest?.('button.menu-title') as HTMLButtonElement | null;
    if (!btn) return;
    const ids = menus.map((m) => m.id);
    const cur = btn.dataset.menuId ?? '';
    const first = ids[0] ?? cur;
    const last = ids[ids.length - 1] ?? cur;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = titleStep(ids, cur, e.key === 'ArrowRight' ? 1 : -1);
      if (openId !== null) openMenu(next, 'first');
      else focusTitle(next);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu(cur, e.key === 'ArrowDown' ? 'first' : 'last');
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const next = e.key === 'Home' ? first : last;
      if (openId !== null) openMenu(next, 'first');
      else focusTitle(next);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu(cur, 'first');
    } else if (e.key === 'Escape') {
      setOpenId(null);
    } else if (e.key === 'Tab' && openId !== null) {
      setOpenId(null); // close; native focus order takes over
    }
  };

  return (
    <div class="menubar" ref={rootRef}>
      <div class="menubar-brand">
        <BrandMark />
        <span class="brand-name">{Brand.name}</span>
      </div>

      <div class="menubar-menus" role="menubar" aria-label={t().menubarLabel} onKeyDown={onMenubarKey}>
      {menus.map((menu) => (
        <div class="menu" key={menu.id}>
          <button
            class={`menu-title ${openId === menu.id ? 'open' : ''}`}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openId === menu.id}
            tabindex={rovedId === menu.id ? 0 : -1}
            data-menu-id={menu.id}
            onClick={() => {
              if (openId === menu.id) {
                if (hoverSwitched.current) {
                  hoverSwitched.current = false; // opened by the hover switch — keep open
                } else {
                  setOpenId(null);
                }
              } else {
                hoverSwitched.current = false;
                setOpenId(menu.id);
              }
            }}
            onPointerEnter={() => {
              if (openId !== null && openId !== menu.id) {
                hoverSwitched.current = true;
                setOpenId(menu.id);
              }
            }}
          >
            {menu.title()}
          </button>
          {openId === menu.id && (
            <MenuDropdown
              menuId={menu.id}
              items={menu.items}
              focusItem={openFocus.current}
              onFocusDone={() => {
                openFocus.current = null;
              }}
              onRun={() => setOpenId(null)}
              onTitleArrow={(delta) => {
                // APG: with a submenu open, Left/Right move to the adjacent
                // menubar item and open its submenu (hover-switch equivalent)
                const ids = menus.map((m) => m.id);
                openMenu(titleStep(ids, menu.id, delta), 'first');
              }}
              onEscape={() => {
                focusTitle(menu.id); // restore focus to the title (APG)
                setOpenId(null);
              }}
            />
          )}
        </div>
      ))}
      </div>
    </div>
  );
}

export function BrandMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--accent-dim)" />
      <path
        d="M4 16h2l2-7 3 14 3-18 3 22 3-16 2 5h6"
        stroke="var(--accent)"
        stroke-width="2"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/**
 * Dropdown body: mixed rows folded into labelled sections (role=group is
 * an allowed child of menu and keeps the headers meaningful to AT).
 */
export function MenuDropdown({
  menuId,
  items,
  onRun,
  focusItem,
  onFocusDone,
  onEscape,
  onTitleArrow,
}: {
  menuId: string;
  items: import('../menus').MenuItemDef[];
  onRun: () => void;
  focusItem: 'first' | 'last' | null;
  onFocusDone: () => void;
  onEscape: () => void;
  onTitleArrow: (delta: 1 | -1) => void;
}) {
  const rows = foldMenuItems(items, (id) => commands.find((c) => c.id === id)?.label() ?? id);
  const dropRef = useRef<HTMLDivElement>(null);

  // Viewport-edge handling (clip fix): the dropdown is plain abspos (this
  // app has no positioning library), so shift it left just enough to clear
  // the right edge — never past the left margin. Vertical space is already
  // handled by max-height + internal scroll (menus open from the top bar).
  useLayoutEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    if (focusItem) {
      const its = [...el.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
      const target = focusItem === 'first' ? its[0] : its[its.length - 1];
      target?.focus();
      onFocusDone();
    }
    const margin = 8;
    const rect = el.getBoundingClientRect();
    const over = rect.right - (window.innerWidth - margin);
    if (over > 0) {
      el.style.left = `${Math.max(-over, margin - rect.left)}px`;
    }
  }, []);

  const groups = new Map<number, typeof rows>();
  for (const row of rows) {
    if (row.group !== undefined) {
      const list = groups.get(row.group) ?? [];
      list.push(row);
      groups.set(row.group, list);
    }
  }
  // In-menu keyboard (APG): Up/Down cycle items (wrapping), Home/End,
  // typeahead by first letter, Escape closes + refocuses the title, Tab
  // closes and lets native focus order proceed, Enter/Space activate and
  // return focus to the menubar (native menubar behavior).
  const onMenuKey = (e: KeyboardEvent): void => {
    const el = dropRef.current;
    if (!el) return;
    const btns = [...el.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
    if (btns.length === 0) return;
    const ids = btns.map((b) => b.dataset.cmdId ?? '');
    const active = document.activeElement as HTMLButtonElement | null;
    const cur = active && btns.includes(active) ? (active.dataset.cmdId ?? '') : (ids[0] ?? '');
    const labelOf = (id: string): string => commands.find((c) => c.id === id)?.label() ?? id;
    const focusId = (id: string): void => {
      btns[ids.indexOf(id)]?.focus();
    };
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusId(menuStep(ids, cur, e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onTitleArrow(e.key === 'ArrowRight' ? 1 : -1);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      focusId(e.key === 'Home' ? (ids[0] ?? '') : (ids[ids.length - 1] ?? ''));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onEscape();
    } else if (e.key === 'Tab') {
      onRun();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      active?.click();
      onEscape();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const hit = typeaheadStep(ids, cur, e.key, labelOf);
      if (hit) {
        e.preventDefault();
        focusId(hit);
      }
    }
  };

  return (
    <div ref={dropRef} class="menu-dropdown" role="menu" data-menu={menuId} onKeyDown={onMenuKey}>
      {rows.map((row, i) => {
        if (row.kind === 'header') {
          return (
            <div class="menu-group" role="group" aria-label={row.label} key={`grp-${i}`}>
              <div class="menu-header" aria-hidden="true">
                {row.label}
              </div>
              {(groups.get(row.group ?? -1) ?? []).map((m) => {
                const cmd = commands.find((c) => c.id === m.id);
                return cmd ? <MenuItem key={m.id} cmd={cmd} onRun={onRun} /> : null;
              })}
            </div>
          );
        }
        if (row.group !== undefined) return null; // rendered inside its group
        if (row.kind === 'separator') return <div class="menu-sep" key={`sep-${i}`} />;
        const cmd = commands.find((c) => c.id === row.id);
        return cmd ? <MenuItem key={row.id} cmd={cmd} onRun={onRun} /> : null;
      })}
    </div>
  );
}

function MenuItem({ cmd, onRun }: { cmd: Command; onRun: () => void }) {
  return (
    <button
      class="menu-item"
      role="menuitem"
      tabindex={-1}
      data-cmd-id={cmd.id}
      onClick={() => {
        onRun();
        cmd.run();
      }}
    >
      <span class="menu-check">{cmd.check && cmd.isChecked?.() ? '✔' : ''}</span>
      <span class="menu-label">{cmd.label()}</span>
      {cmd.kbd && <span class="menu-kbd">{cmd.kbd()}</span>}
    </button>
  );
}
