/**
 * APG toolbar roving-tabindex helper (CB-2.3): ONE tab stop per toolbar,
 * Arrow keys move focus among the toolbar's buttons (disabled skipped),
 * Home/End jump to the ends. Text inputs are excluded structurally — the
 * selector matches buttons only.
 */
import { useRef } from 'preact/hooks';

export interface Roving {
  ref: preact.Ref<HTMLDivElement>;
  onKeyDown: (e: KeyboardEvent) => void;
  onFocusIn: () => void;
}

export function useRovingToolbar(): Roving {
  const ref = useRef<HTMLDivElement>(null);

  const items = (): HTMLButtonElement[] =>
    Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
    );

  const onKeyDown = (e: KeyboardEvent): void => {
    const list = items();
    if (list.length === 0) return;
    const active = document.activeElement as HTMLButtonElement | null;
    const idx = active ? list.indexOf(active) : -1;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % list.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    if (next >= 0) {
      e.preventDefault();
      // arrows inside the toolbar move focus only — do not also seek
      e.stopPropagation();
      const target = list[next];
      if (!target || !ref.current) return;
      for (const b of ref.current.querySelectorAll<HTMLButtonElement>('button'))
        b.tabIndex = -1;
      target.tabIndex = 0;
      target.focus();
    }
  };

  const onFocusIn = (): void => {
    // whoever receives focus becomes the single tab stop (roving tabindex)
    const root = ref.current;
    if (!root) return;
    const active = document.activeElement;
    for (const b of root.querySelectorAll<HTMLButtonElement>('button'))
      b.tabIndex = b === active ? 0 : -1;
  };

  return { ref, onKeyDown, onFocusIn };
}
