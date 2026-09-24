/**
 * Global shortcut map (RED first) — professional standard combos with the
 * AudioMass legacy shift-letter set preserved for muscle memory.
 *
 * Standard: Ctrl/Cmd+Z undo · Ctrl+Shift+Z and Ctrl+Y redo ·
 * Ctrl+X/C/V cut/copy/paste · Ctrl+A select all · Ctrl+O open.
 * Pure table + resolver — the browser glue in keyboard.ts calls this.
 */
import { describe, expect, test } from 'vitest';
import { kbdHints, resolveShortcut } from '../../src/app/shortcuts';

function std(
  key: string,
  mods: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }> = {},
): ReturnType<typeof resolveShortcut> {
  return resolveShortcut({
    key,
    ctrl: mods.ctrl ?? false,
    meta: mods.meta ?? false,
    alt: mods.alt ?? false,
    shift: mods.shift ?? false,
  });
}

describe('standard undo/redo shortcuts', () => {
  test('Ctrl+Z and Cmd+Z undo', () => {
    expect(std('z', { ctrl: true })).toBe('edit.undo');
    expect(std('Z', { ctrl: true })).toBe('edit.undo'); // real browsers deliver uppercase
    expect(std('z', { meta: true })).toBe('edit.undo'); // macOS ⌘Z
  });

  test('Ctrl+Y and Cmd+Y redo (Windows/Audacity convention)', () => {
    expect(std('y', { ctrl: true })).toBe('edit.redo');
    expect(std('Y', { ctrl: true })).toBe('edit.redo');
    expect(std('y', { meta: true })).toBe('edit.redo');
  });

  test('Ctrl+Shift+Z and Cmd+Shift+Z redo (Adobe/macOS convention)', () => {
    expect(std('Z', { ctrl: true, shift: true })).toBe('edit.redo');
    expect(std('z', { ctrl: true, shift: true })).toBe('edit.redo'); // synthesized events
    expect(std('Z', { meta: true, shift: true })).toBe('edit.redo');
  });
});

describe('standard clipboard + selection shortcuts', () => {
  test('Ctrl/Cmd+X, C, V route to cut/copy/paste', () => {
    expect(std('x', { ctrl: true })).toBe('edit.cut');
    expect(std('c', { ctrl: true })).toBe('edit.copy');
    expect(std('v', { ctrl: true })).toBe('edit.paste');
    expect(std('X', { meta: true })).toBe('edit.cut');
    expect(std('C', { meta: true })).toBe('edit.copy');
    expect(std('V', { meta: true })).toBe('edit.paste');
  });

  test('Ctrl/Cmd+A select all', () => {
    expect(std('a', { ctrl: true })).toBe('edit.selectAll');
    expect(std('A', { meta: true })).toBe('edit.selectAll');
  });

  test('Ctrl+O opens a file', () => {
    expect(std('o', { ctrl: true })).toBe('file.open');
    expect(std('O', { meta: true })).toBe('file.open');
  });
});

describe('AudioMass legacy shift-letter combos still work', () => {
  test('Shift+Z/Y undo/redo, Shift+X/C/V clipboard, Shift+A select, Shift+N silence', () => {
    expect(std('z', { shift: true })).toBe('edit.undo');
    expect(std('Z', { shift: true })).toBe('edit.undo');
    expect(std('y', { shift: true })).toBe('edit.redo');
    expect(std('x', { shift: true })).toBe('edit.cut');
    expect(std('c', { shift: true })).toBe('edit.copy');
    expect(std('v', { shift: true })).toBe('edit.paste');
    expect(std('a', { shift: true })).toBe('edit.selectAll');
    expect(std('n', { shift: true })).toBe('edit.insertSilence');
  });
});

describe('non-shortcuts must not hijack the browser', () => {
  test('plain letters and bare modifier presses resolve to nothing', () => {
    expect(std('z')).toBeNull();
    expect(std('Z')).toBeNull();
    expect(std('Control')).toBeNull();
    expect(std('a', { ctrl: true, alt: true })).toBeNull(); // Alt combos stay with the browser
    expect(std('s', { ctrl: true })).toBeNull(); // unmapped combos stay unbound
  });
});

describe('M9d2 arrangement shortcuts (single-source)', () => {
  test('Ctrl+D duplicates the selected clip; plain S splits at the cursor', () => {
    expect(std('d', { ctrl: true })).toBe('clip.duplicate');
    expect(std('D', { meta: true })).toBe('clip.duplicate');
    expect(std('s')).toBe('clip.split');
    expect(std('S')).toBe('clip.split');
  });

  test('Delete/Backspace route to clip.delete (doc fallback decided by the command)', () => {
    expect(std('Delete')).toBe('clip.delete');
    expect(std('Backspace')).toBe('clip.delete');
  });

  test('plain letters stay untouched except the arrangement keys', () => {
    expect(std('z')).toBeNull();
    expect(std('x')).toBeNull();
    expect(std('a')).toBe('automation.toggle'); // A4: A toggles envelope mode
  });
});

describe('platform-aware menu hints', () => {
  test('generic (Windows/Linux) form', () => {
    expect(kbdHints(false)).toMatchObject({
      undo: 'Ctrl+Z',
      redo: 'Ctrl+Y',
      cut: 'Ctrl+X',
      copy: 'Ctrl+C',
      paste: 'Ctrl+V',
      selectAll: 'Ctrl+A',
      open: 'Ctrl+O',
    });
  });

  test('macOS form uses ⌘ glyphs', () => {
    expect(kbdHints(true)).toMatchObject({
      undo: '⌘Z',
      redo: '⇧⌘Z',
      cut: '⌘X',
      copy: '⌘C',
      paste: '⌘V',
      selectAll: '⌘A',
      open: '⌘O',
    });
  });
});
