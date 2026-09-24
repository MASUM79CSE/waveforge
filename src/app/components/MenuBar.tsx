import { useEffect, useRef, useState } from 'preact/hooks';
import { menus } from '../menus';
import { commands, type Command } from '../commands';
import { experimentalFx } from '../state';
import { Brand } from '../../brand';

export function MenuBar() {
  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
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

  return (
    <div class="menubar" ref={rootRef}>
      <div class="menubar-brand">
        <BrandMark />
        <span class="brand-name">{Brand.name}</span>
      </div>

      {menus.map((menu) => (
        <div class="menu" key={menu.id}>
          <button
            class={`menu-title ${openId === menu.id ? 'open' : ''}`}
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
            <div class="menu-dropdown" role="menu">
              {menu.items.map((item, i) => {
                if (item === '-') return <div class="menu-sep" key={`sep-${i}`} />;
                const cmd = commands.find((c) => c.id === item);
                if (!cmd) return null;
                if (cmd.experimental && !experimentalFx.value) return null;
                return <MenuItem key={item} cmd={cmd} onRun={() => setOpenId(null)} />;
              })}
            </div>
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

function MenuItem({ cmd, onRun }: { cmd: Command; onRun: () => void }) {
  return (
    <button
      class="menu-item"
      role="menuitem"
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
