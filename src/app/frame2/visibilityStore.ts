/**
 * frame2 visibility store (UX-3.2) — preact signal binding for the
 * visibility core (`./visibility`). Commands in the registry
 * (`view.toolbars.*`, `view.layoutReset`) mutate through here so the ONE
 * registry stays the single entry point. Storage key + namespace belong to
 * the flag program (`waveforge.frame2.toolbars`).
 */
import { signal } from '@preact/signals';
import {
  loadVisibility,
  normalizeVisibility,
  resetVisibilityStore,
  saveVisibility,
  toggleGroup,
  type Frame2ToolbarGroup,
  type VisibilityMap,
} from './visibility';

const storage = {
  get: (k: string): string | null =>
    typeof localStorage === 'undefined' ? null : localStorage.getItem(k),
  set: (k: string, v: string): void => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(k, v);
  },
  remove: (k: string): void => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(k);
  },
};

export { FRAME2_TOOLBAR_GROUPS, TOOLBAR_STORE_KEY } from './visibility';
export type { Frame2ToolbarGroup, VisibilityMap } from './visibility';

export const visibility = signal<VisibilityMap>(loadVisibility(storage.get));

/** Toolbars popover open state (toggled by `help.toolbars`). */
export const toolbarsPopoverOpen = signal(false);

export function toggleToolbarGroup(group: Frame2ToolbarGroup): void {
  visibility.value = toggleGroup(visibility.value, group);
  saveVisibility(visibility.value, storage.set);
}

export function resetLayout(): VisibilityMap {
  visibility.value = resetVisibilityStore(storage.remove);
  return visibility.value;
}

/** Re-read from storage (used when another tab may have changed it). */
export function reloadVisibility(): void {
  visibility.value = normalizeVisibility(loadVisibility(storage.get));
}
