/**
 * Theme application (D9) — mirrors the theme/accent signals onto
 * `<html data-theme data-accent>` so tokens.css swaps every color, and
 * invalidates the canvas palette cache so painters re-read CSS variables.
 */
import { accent, setAccent, setThemeName, theme } from './state';

let paletteVersion = 0;

/** Bump whenever the applied theme changes; painters re-read CSS vars. */
export function paletteVersionNow(): number {
  return paletteVersion;
}

export function applyTheme(): void {
  const root = document.documentElement;
  root.dataset.theme = theme.value;
  root.dataset.accent = accent.value;
  paletteVersion += 1;
}

export function toggleTheme(): void {
  setThemeName(theme.value === 'dark' ? 'light' : 'dark');
  applyTheme();
}

export function cycleAccent(): void {
  const order = ['cyan', 'teal', 'green', 'amber', 'magenta'] as const;
  const next = order[(order.indexOf(accent.value) + 1) % order.length] ?? 'cyan';
  setAccent(next);
  applyTheme();
}
