import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { foldMenuItems, menus } from '../menus';
import { commands, type Command } from '../commands';
import { Brand } from '../../brand';
import { t } from '../../i18n';

type FocusItem = 'first' | 'last' | null;

/**
 * The menubar is shared by v1 and the v2 bar. `apg` (CB-D17) opts into the
 * APG menubar keyboard model + ARIA roles for the v2 bar; the v1 default
 * keeps the historical DOM and click/hover behavior byte-stable (the v1
 * suite pins ~86 `getByRole('button')` title probes).
 */
export function MenuBar({ apg = false }: { apg?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  // true when the current menu was opened by hovering another title —
  // a click on the freshly-switched title must keep it open (native
  // menu behaviour), not toggle it straight back closed
  const hoverSwitched = useRef(false);
  // 'first'/'last' when keyboard opened the menu → the dropdown focuses
  // that end on mount (APG); null for mouse opens (focus stays on title)
  const kbdFocus = useRef<FocusItem>(null);

  const titleEls = (): HTMLButtonElement[] =>
    Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('.menu-title') ?? []);
  const focusTitle = (i: number): void => {
    const el = titleEls()[i];
    setActiveIdx(i);
    el?.focus();
  };

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenId(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);

  /** APG title keyboard: traverse / open with the right item focused. */
  const onTitleKey = (i: number, id: string) => (e: KeyboardEvent) => {
    if (!apg) return;
    const n = titleEls().length;
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        if (openId !== null) setOpenId(null);
        focusTitle((i + 1) % n);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (openId !== null) setOpenId(null);
        focusTitle((i - 1 + n) % n);
        break;
      case 'Home':
        e.preventDefault();
        focusTitle(0);
        break;
      case 'End':
        e.preventDefault();
        focusTitle(n - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        kbdFocus.current = 'first';
        setOpenId(id);
        break;
      case 'ArrowUp':
        e.preventDefault();
        kbdFocus.current = 'last';
        setOpenId(id);
        break;
      case 'Enter':
      case ' ':
        kbdFocus.current = 'first'; // the native click opens; focus follows
        break;
      case 'Escape':
        if (openId === id) {
          setOpenId(null);
          focusTitle(i);
        }
        break;
      default:
        break;
    }
  };

  /** APG menu-level Left/Right: jump to the adjacent menu, item focused. */
  const switchMenu = (delta: 1 | -1, focusItem: 'first' | 'last'): void => {
    const idx = menus.findIndex((m) => m.id === openId);
    if (idx === -1) return;
    const next = menus[(idx + delta + menus.length) % menus.length];
    if (!next) return;
    kbdFocus.current = focusItem;
    setActiveIdx(menus.indexOf(next));
    setOpenId(next.id);
  };

  /** Close from the keyboard — focus returns to the owning title (APG). */
  const closeToTitle = (): void => {
    kbdFocus.current = null;
    setOpenId(null);
    focusTitle(Math.max(0, activeIdx));
  };

  const runAndClose = (): void => {
    const wasKbd = kbdFocus.current !== null;
    setOpenId(null);
    kbdFocus.current = null;
    if (apg && wasKbd) focusTitle(Math.max(0, activeIdx));
  };

  return (
    <div
      class="menubar"
      ref={rootRef}
      role={apg ? 'menubar' : undefined}
      aria-label={apg ? t().menuBarLabel : undefined}
    >
      <div class="menubar-brand" role={apg ? 'none' : undefined}>
        <BrandMark />
        <span class="brand-name">{Brand.name}</span>
      </div>

      {menus.map((menu, i) => (
        <div class="menu" key={menu.id} role={apg ? 'none' : undefined}>
          <button
            class={`menu-title ${openId === menu.id ? 'open' : ''}`}
            role={apg ? 'menuitem' : undefined}
            aria-haspopup={apg ? 'menu' : undefined}
            aria-expanded={apg ? openId === menu.id : undefined}
            tabIndex={apg ? (i === activeIdx ? 0 : -1) : undefined}
            onFocus={() => setActiveIdx(i)}
            onPointerDown={() => {
              kbdFocus.current = null; // mouse open — no focus jump
            }}
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
            onKeyDown={onTitleKey(i, menu.id)}
          >
            {menu.title()}
          </button>
          {openId === menu.id && (
            <MenuDropdown
              menuId={menu.id}
              items={menu.items}
              onRun={runAndClose}
              apg={apg}
              focusOnOpen={kbdFocus.current}
              onSwitch={switchMenu}
              onEscape={closeToTitle}
            />
          )}
        </div>
      ))}
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
  apg = false,
  focusOnOpen = null,
  onSwitch,
  onEscape,
}: {
  menuId: string;
  items: import('../menus').MenuItemDef[];
  onRun: () => void;
  apg?: boolean;
  focusOnOpen?: FocusItem;
  onSwitch?: (delta: 1 | -1, focusItem: 'first' | 'last') => void;
  onEscape?: () => void;
}) {
  const rows = foldMenuItems(items, (id) => commands.find((c) => c.id === id)?.label() ?? id);
  const dropRef = useRef<HTMLDivElement>(null);

  // APG: a keyboard-opened menu receives focus on its first/last item.
  useLayoutEffect(() => {
    const el = dropRef.current;
    if (!el || !apg || focusOnOpen === null) return;
    const list = Array.from(el.querySelectorAll<HTMLButtonElement>('.menu-item'));
    const target = focusOnOpen === 'first' ? list[0] : list[list.length - 1];
    target?.focus();
  }, []);

  // Viewport-edge handling (clip fix): the dropdown is plain abspos (this
  // app has no positioning library), so shift it left just enough to clear
  // the right edge — never past the left margin. Vertical space is already
  // handled by max-height + internal scroll (menus open from the top bar).
  useLayoutEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    const over = rect.right - (window.innerWidth - margin);
    if (over > 0) {
      el.style.left = `${Math.max(-over, margin - rect.left)}px`;
    }
  }, []);

  /** APG item navigation over the flat (rendered) item list. */
  const onMenuKey = (e: KeyboardEvent): void => {
    if (!apg) return;
    const el = dropRef.current;
    if (!el) return;
    const list = Array.from(el.querySelectorAll<HTMLButtonElement>('.menu-item'));
    const idx = list.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (i: number): void => {
      e.preventDefault();
      list[(i + list.length) % list.length]?.focus();
    };
    switch (e.key) {
      case 'ArrowDown':
        focusAt(idx + 1);
        break;
      case 'ArrowUp':
        focusAt(idx <= 0 ? list.length - 1 : idx - 1);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(list.length - 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        onSwitch?.(-1, 'first');
        break;
      case 'ArrowRight':
        e.preventDefault();
        onSwitch?.(1, 'first');
        break;
      case 'Escape':
        e.preventDefault();
        onEscape?.();
        break;
      case 'Tab':
        onRun(); // close; the browser moves focus
        break;
      default:
        break;
    }
  };

  const groups = new Map<number, typeof rows>();
  for (const row of rows) {
    if (row.group !== undefined) {
      const list = groups.get(row.group) ?? [];
      list.push(row);
      groups.set(row.group, list);
    }
  }
  return (
    <div
      ref={dropRef}
      class="menu-dropdown"
      role="menu"
      data-menu={menuId}
      onKeyDown={onMenuKey}
    >
      {rows.map((row, i) => {
        if (row.kind === 'header') {
          return (
            <div class="menu-group" role="group" aria-label={row.label} key={`grp-${i}`}>
              <div class="menu-header" aria-hidden="true">
                {row.label}
              </div>
              {(groups.get(row.group ?? -1) ?? []).map((m) => {
                const cmd = commands.find((c) => c.id === m.id);
                return cmd ? <MenuItem key={m.id} cmd={cmd} onRun={onRun} apg={apg} /> : null;
              })}
            </div>
          );
        }
        if (row.group !== undefined) return null; // rendered inside its group
        if (row.kind === 'separator')
          return <div class="menu-sep" role={apg ? 'separator' : undefined} key={`sep-${i}`} />;
        const cmd = commands.find((c) => c.id === row.id);
        return cmd ? <MenuItem key={row.id} cmd={cmd} onRun={onRun} apg={apg} /> : null;
      })}
    </div>
  );
}

function MenuItem({
  cmd,
  onRun,
  apg = false,
}: {
  cmd: Command;
  onRun: () => void;
  apg?: boolean;
}) {
  return (
    <button
      class="menu-item"
      role="menuitem"
      tabIndex={apg ? -1 : undefined}
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
