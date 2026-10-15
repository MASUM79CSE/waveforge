// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveShortcut, type ShortcutEvent } from '../../../src/app/shortcuts';
import { commands } from '../../../src/app/commands';

/**
 * CB-6.1 shortcut-truth audit: EVERY registry `kbd()` hint must correspond
 * to a real binding, and the required bar hints must exist. Truth sources:
 * `resolveShortcut` (combo + R-series table) and the keyboard.ts switch
 * (transport/navigation plain keys) — grepped live so the test fails when
 * either side drifts (E-CB-021; caught the "Tab" hint on view.center and
 * the Phase-4 mis-purge of the truthful R/P/M hints).
 */

const kbdSrc = readFileSync('src/app/keyboard.ts', 'utf8');
const shortcutsSrc = readFileSync('src/app/shortcuts.ts', 'utf8');

function keyBoundInSwitch(key: string): boolean {
  // a case label for the key (lower or upper) exists in the switch
  return new RegExp(`case\\s+'${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`, 'i').test(kbdSrc);
}

function resolve(ev: Partial<ShortcutEvent>): string | null {
  return resolveShortcut({
    key: ev.key ?? '',
    ctrl: ev.ctrl ?? false,
    meta: ev.meta ?? false,
    alt: false,
    shift: ev.shift ?? false,
  });
}

describe('CB-6.1 shortcut truth', () => {
  const truth: Record<string, string> = {
    Space: 'transport.playPause',
    L: 'transport.loop',
    Q: 'edit.deselect',
    R: 'record.toggle',
    P: 'record.punch',
    M: 'record.metronome',
    S: 'clip.split',
    A: 'automation.toggle',
    '+': 'view.zoomIn',
    '-': 'view.zoomOut',
    '0': 'view.zoomReset',
    'Shift+←': 'transport.nudgeBack',
    'Shift+→': 'transport.nudgeFwd',
    Del: 'edit.delete', // via clip.delete with edit-selection fallback
    'Ctrl+O': 'file.open',
    'Ctrl+Z': 'edit.undo',
    'Ctrl+Y': 'edit.redo',
    'Ctrl+X': 'edit.cut',
    'Ctrl+C': 'edit.copy',
    'Ctrl+V': 'edit.paste',
    'Ctrl+A': 'edit.selectAll',
    'Ctrl+D': 'clip.duplicate',
    'Shift+N': 'edit.insertSilence',
  };

  test('the truth table itself is real: switch/table/map agree', () => {
    expect(keyBoundInSwitch(' ')).toBe(true); // Space
    expect(keyBoundInSwitch('l')).toBe(true);
    expect(keyBoundInSwitch('q')).toBe(true);
    expect(keyBoundInSwitch('+')).toBe(true);
    expect(keyBoundInSwitch('0')).toBe(true);
    expect(resolve({ key: 'r' })).toBe('record.toggle');
    expect(resolve({ key: 'p' })).toBe('record.punch');
    expect(resolve({ key: 'm' })).toBe('record.metronome');
    expect(resolve({ key: 'a' })).toBe('automation.toggle');
    expect(resolve({ key: 's' })).toBe('clip.split');
    expect(resolve({ key: 'o', ctrl: true })).toBe('file.open');
    expect(resolve({ key: 'z', ctrl: true })).toBe('edit.undo');
    expect(resolve({ key: 'y', ctrl: true })).toBe('edit.redo');
    expect(resolve({ key: 'x', ctrl: true })).toBe('edit.cut');
    expect(resolve({ key: 'c', ctrl: true })).toBe('edit.copy');
    expect(resolve({ key: 'v', ctrl: true })).toBe('edit.paste');
    expect(resolve({ key: 'a', ctrl: true })).toBe('edit.selectAll');
    expect(resolve({ key: 'd', ctrl: true })).toBe('clip.duplicate');
    expect(resolve({ key: 'n', shift: true })).toBe('edit.insertSilence');
    expect(resolve({ key: 'delete' })).toBe('clip.delete');
    // 'Tab' is NOT bound anywhere — view.center must not advertise it
    expect(keyBoundInSwitch('tab')).toBe(false);
    expect(shortcutsSrc).not.toMatch(/'tab'/);
    for (const c of commands) {
      if (c.id === 'view.center') expect(c.kbd, 'view.center must stay hint-free').toBeUndefined();
    }
  });

  test('every registry kbd hint corresponds to a real binding', () => {
    for (const c of commands) {
      const hint = c.kbd?.();
      if (!hint) continue;
      expect(truth[hint], `${c.id} advertises "${hint}" — not a real binding`).toBeDefined();
    }
  });

  test('required bar hints exist (parity: shortcut column)', () => {
    const hintOf = (id: string): string | undefined =>
      commands.find((c) => c.id === id)?.kbd?.();
    expect(hintOf('transport.playPause')).toBe('Space');
    expect(hintOf('transport.loop')).toBe('L');
    expect(hintOf('edit.deselect')).toBe('Q');
    expect(hintOf('record.toggle')).toBe('R');
    expect(hintOf('record.punch')).toBe('P');
    expect(hintOf('record.metronome')).toBe('M');
    // monitor deliberately has none — M belongs to the metronome
    expect(hintOf('record.monitor')).toBeUndefined();
  });
});
