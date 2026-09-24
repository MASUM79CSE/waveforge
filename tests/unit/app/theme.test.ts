// @vitest-environment jsdom
import { describe, expect, test, beforeEach } from 'vitest';
import {
  accent,
  setAccent,
  setThemeName,
  theme,
} from '../../../src/app/state';
import {
  applyTheme,
  cycleAccent,
  paletteVersionNow,
  toggleTheme,
} from '../../../src/app/theme';

describe('M-D9: theming', () => {
  beforeEach(() => {
    setThemeName('dark');
    setAccent('cyan');
    applyTheme();
  });

  test('applyTheme mirrors signals onto <html> data attributes and bumps the palette version', () => {
    const before = paletteVersionNow();
    setThemeName('light');
    setAccent('teal');
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.accent).toBe('teal');
    expect(paletteVersionNow()).toBeGreaterThan(before);
  });

  test('toggleTheme flips and persists via the state setter', () => {
    toggleTheme();
    expect(theme.value).toBe('light');
    expect(localStorage.getItem('waveforge.theme')).toBe('light');
    toggleTheme();
    expect(theme.value).toBe('dark');
    expect(localStorage.getItem('waveforge.theme')).toBe('dark');
  });

  test('cycleAccent walks the ring and persists', () => {
    cycleAccent(); // cyan -> teal
    expect(accent.value).toBe('teal');
    expect(localStorage.getItem('waveforge.accent')).toBe('teal');
    for (let i = 0; i < 4; ++i) cycleAccent();
    expect(accent.value).toBe('cyan');
  });
});
