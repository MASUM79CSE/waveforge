/**
 * RovingToolbar (UX-2.2 DOM wrapper) — one real tab stop per toolbar,
 * arrows rove via the unit-tested `roving` core. APG contract
 * (CLEAN_ROOM_LOG row 2): Tab into the toolbar focuses the first enabled
 * control (or restores last focus); ←/→ (and ↑/↓, no vertical-only controls
 * by construction) move with wrap; Home/End jump; disabled controls stay
 * focusable with aria-disabled. The wrapper never renders controls itself —
 * group definitions (Phase 3) pass them via the render prop.
 */
import type { ComponentChild, JSX } from 'preact';
import { useCallback, useState } from 'preact/hooks';import {
  nextAfterArrow,
  resolveInitial,
  type ToolbarArrow,
  type ToolbarItemState,
} from './roving';

export interface RovingApi {
  /** id of the current tab stop */
  focusId: string | null;
  /** props to spread on each control wrapper: data-tb-id + tabIndex */
  attrs: (id: string) => { 'data-tb-id': string; tabIndex: 0 | -1 };
  /** focus a control programmatically (after visibility/list changes) */
  takeFocus: (id: string) => void;
}

interface RovingToolbarProps {
  label: string;
  items: ToolbarItemState[];
  children: (api: RovingApi) => ComponentChild;
}

export function RovingToolbar({ label, items, children }: RovingToolbarProps) {
  const [current, setCurrent] = useState<string | null>(null);

  const focusEl = useCallback((id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-tb-id="${CSS.escape(id)}"]`);
    el?.focus();
  }, []);

  const takeFocus = useCallback(
    (id: string) => {
      setCurrent(id);
      focusEl(id);
    },
    [focusEl],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const keys: ToolbarArrow[] = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (!(keys as string[]).includes(e.key)) return;
      const next = nextAfterArrow(items, current, e.key as ToolbarArrow);
      if (next && next.id !== current) {
        e.preventDefault();
        e.stopPropagation();
        takeFocus(next.id);
      } else if (next) {
        e.preventDefault(); // consumed even when we cannot move
      }
    },
    [items, current, takeFocus],
  );

  const initial = resolveInitial(items, current);
  const focusId = current !== null && items.some((it) => it.id === current) ? current : initial?.id ?? null;

  const api: RovingApi = {
    focusId,
    attrs: (id: string) => ({ 'data-tb-id': id, tabIndex: id === focusId ? 0 : -1 }),
    takeFocus,
  };

  return (
    <div
      class="f2-toolbar"
      role="toolbar"
      aria-label={label}
      onKeyDown={onKeyDown as (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => void}
    >
      {children(api)}
    </div>
  );
}
