/**
 * Pure navigation model for the menubar (APG menubar pattern).
 * Kept free of DOM so the wrap/skip rules are unit-testable; the
 * MenuBar component maps ids → elements and moves real focus.
 */

/** Next (delta ±1) title after `current`, wrapping; falls back to the first. */
export function titleStep<T>(titles: T[], current: T, delta: 1 | -1): T {
  if (titles.length === 0) return current;
  const i = titles.indexOf(current);
  if (i === -1) return titles[0] as T;
  const n = titles.length;
  return titles[(i + delta + n) % n] as T;
}

/** Next menu item after `current`, wrapping; falls back to the first. */
export function menuStep<T>(items: T[], current: T, delta: 1 | -1): T {
  return titleStep(items, current, delta);
}

/**
 * Typeahead: first item after `current` whose label starts with `ch`
 * (case-insensitive), scanning forward and wrapping (if the only match is
 * `current` itself, it is returned). Null when nothing matches.
 */
export function typeaheadStep<T>(
  items: T[],
  current: T,
  ch: string,
  label: (item: T) => string,
): T | null {
  const needle = ch.toLowerCase();
  const i = items.indexOf(current);
  const n = items.length;
  for (let k = 1; k <= n; k++) {
    const cand = items[(i + k) % n] as T;
    if (label(cand).toLowerCase().startsWith(needle)) return cand;
  }
  return null;
}
