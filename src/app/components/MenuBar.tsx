import { useEffect, useRef, useState } from 'preact/hooks';
import { menus } from '../menus';
import { commands, type Command } from '../commands';
import { Brand } from '../../brand';

export function MenuBar() {
  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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
            onClick={() => setOpenId(openId === menu.id ? null : menu.id)}
            onPointerEnter={() => {
              if (openId !== null) setOpenId(menu.id);
            }}
          >
            {menu.title()}
          </button>
          {openId === menu.id && (
            <div class="menu-dropdown" role="menu">
              {menu.items.map((item, i) =>
                item === '-' ? (
                  <div class="menu-sep" key={`sep-${i}`} />
                ) : (
                  <MenuItem
                    key={item}
                    cmd={commands.find((c) => c.id === item)!}
                    onRun={() => setOpenId(null)}
                  />
                ),
              )}
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
      {cmd.kbd && <span class="menu-kbd">{cmd.kbd}</span>}
    </button>
  );
}
