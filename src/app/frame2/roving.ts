/**
 * frame2 roving core (UX-2.2) — pure APG toolbar focus logic.
 *
 * The DOM wrapper (`Toolbar.tsx`) owns one real tab stop and delegates all
 * focus decisions here, so the APG contract is unit-testable without a
 * browser: ArrowLeft/Right rove with wrap, Home/End jump to the first/last
 * ENABLED item, disabled items are skipped by arrows (they stay focusable by
 * direct tab per INTERACTIONS.md §3 discoverability choice), and a
 * fully-disabled toolbar never moves focus.
 */

export interface ToolbarItemState {
  id: string;
  disabled: boolean;
}

function pick(items: ToolbarItemState[], i: number): ToolbarItemState | null {
  return i >= 0 && i < items.length ? items[i] ?? null : null;
}

/** Index of the first enabled item, or null when none are enabled. */
export function firstEnabled(items: ToolbarItemState[]): number | null {
  const i = items.findIndex((it) => !it.disabled);
  return i === -1 ? null : i;
}

function byId(items: ToolbarItemState[], id: string | null): number {
  if (id === null) return -1;
  return items.findIndex((it) => it.id === id);
}

function step(items: ToolbarItemState[], from: number, delta: 1 | -1): number | null {
  const n = items.length;
  if (n === 0) return null;
  const start = firstEnabled(items);
  if (start === null) return null; // nothing enabled → never move
  let i = from;
  for (let hops = 0; hops < n; ++hops) {
    i = (i + delta + n) % n;
    const it = items[i];
    if (it && !it.disabled) return i;
  }
  return start;
}

export type ToolbarArrow = 'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

/**
 * Next focus target for an arrow key from the item with `currentId`.
 * Returns the unchanged item when no move is possible (fully disabled).
 * Unknown current id resolves like a first entry.
 */
export function nextAfterArrow(
  items: ToolbarItemState[],
  currentId: string | null,
  key: ToolbarArrow,
): ToolbarItemState | null {
  if (items.length === 0) return null;
  const start = firstEnabled(items);
  if (start === null) return pick(items, byId(items, currentId));
  switch (key) {
    case 'Home':
      return pick(items, start);
    case 'End': {
      for (let i = items.length - 1; i >= 0; --i) {
        const it = items[i];
        if (it && !it.disabled) return it;
      }
      return pick(items, start);
    }
    case 'ArrowRight':
    case 'ArrowDown':
      return pick(items, step(items, Math.max(byId(items, currentId), 0), 1) ?? start);
    case 'ArrowLeft':
    case 'ArrowUp':
      return pick(items, step(items, Math.max(byId(items, currentId), 0), -1) ?? start);
  }
}

/**
 * Where focus goes when the toolbar receives its tab stop:
 * first visit (or stale id) → first enabled item; revisit → restored item.
 */
export function resolveInitial(
  items: ToolbarItemState[],
  lastFocusedId: string | null,
): ToolbarItemState | null {
  if (items.length === 0) return null;
  const last = byId(items, lastFocusedId);
  if (last >= 0 && !items[last]?.disabled) return pick(items, last);
  const start = firstEnabled(items);
  return pick(items, start ?? -1);
}
