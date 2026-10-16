/**
 * frame2 visibility manager core (UX-2.3) — per-toolbar-group show/hide with
 * Reset, persisted under the flag's own storage namespace. Pure core here;
 * the signal wiring + View-surface live in later phases. Reset is a real
 * capability (IA.md §2): it restores ALL groups visible and clears storage.
 */

export const FRAME2_TOOLBAR_GROUPS = ['transport', 'edit', 'tools', 'timenap', 'meters'] as const;

export type Frame2ToolbarGroup = (typeof FRAME2_TOOLBAR_GROUPS)[number];
export type VisibilityMap = Record<Frame2ToolbarGroup, boolean>;

export const TOOLBAR_STORE_KEY = 'waveforge.frame2.toolbars';

/** Missing/false-by-default merge; unknown ids are ignored. */
export function normalizeVisibility(partial: Partial<VisibilityMap>): VisibilityMap {
  const out = {} as VisibilityMap;
  for (const g of FRAME2_TOOLBAR_GROUPS) out[g] = partial[g] !== false;
  return out;
}

export function toggleGroup(map: VisibilityMap, group: Frame2ToolbarGroup): VisibilityMap {
  return { ...map, [group]: !map[group] };
}

function parse(raw: string | null): VisibilityMap {
  if (raw === null) return normalizeVisibility({});
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const partial: Partial<VisibilityMap> = {};
    for (const g of FRAME2_TOOLBAR_GROUPS) partial[g] = data[g] !== false;
    return normalizeVisibility(partial);
  } catch {
    return normalizeVisibility({}); // garbage → defaults
  }
}

/** Storage-agnostic load (pass `localStorage.getItem.bind(localStorage)`). */
export function loadVisibility(get: (key: string) => string | null): VisibilityMap {
  return parse(get(TOOLBAR_STORE_KEY));
}

export function saveVisibility(map: VisibilityMap, set: (k: string, v: string) => void): void {
  set(TOOLBAR_STORE_KEY, JSON.stringify(map));
}

/** Reset layout: defaults in memory + storage cleared. */
export function resetVisibilityStore(remove: (key: string) => void): VisibilityMap {
  remove(TOOLBAR_STORE_KEY);
  return normalizeVisibility({});
}
