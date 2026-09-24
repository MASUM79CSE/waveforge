/**
 * Keyboard shortcut catalog (D6) — single aggregated view of every binding:
 * professional modifier combos, the AudioMass legacy shift-letter layer,
 * transport and view keys. Pure data; rendered by ShortcutsOverlay.tsx and
 * unit-tested so the overlay can never list a binding that does not exist.
 *
 * Source of truth note: the *behaviour* lives in shortcuts.ts (modifier
 * layer) and keyboard.ts (plain keys). Rows here document both; the test
 * pins the essential ones.
 */

export interface ShortcutRow {
  key: string;
  label: string;
}

export interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

export const shortcutCatalog: ShortcutGroup[] = [
  {
    title: 'Playback',
    rows: [
      { key: 'Space', label: 'Play / Pause' },
      { key: 'L', label: 'Toggle loop' },
      { key: '← / →', label: 'Seek ∓1 s' },
      { key: 'Shift+← / Shift+→', label: 'Seek ∓5 s' },
      { key: 'Home / End', label: 'Seek to start / end' },
      { key: 'R', label: 'Record' },
    ],
  },
  {
    title: 'Edit',
    rows: [
      { key: 'Ctrl+Z', label: 'Undo' },
      { key: 'Ctrl+Y', label: 'Redo' },
      { key: 'Ctrl+X', label: 'Cut selection' },
      { key: 'Ctrl+C', label: 'Copy selection' },
      { key: 'Ctrl+V', label: 'Paste' },
      { key: 'Ctrl+A', label: 'Select all' },
      { key: 'Q', label: 'Clear selection' },
    ],
  },
  {
    title: 'AudioMass legacy (Shift + key)',
    rows: [
      { key: 'Shift+Z', label: 'Undo' },
      { key: 'Shift+Y', label: 'Redo' },
      { key: 'Shift+X', label: 'Cut selection' },
      { key: 'Shift+C', label: 'Copy selection' },
      { key: 'Shift+V', label: 'Paste' },
      { key: 'Shift+A', label: 'Select all' },
      { key: 'Shift+N', label: 'Insert silence' },
      { key: '~', label: 'Deselect all (legacy)' },
    ],
  },
  {
    title: 'View & files',
    rows: [
      { key: 'Ctrl+O', label: 'Open file' },
      { key: '+ / =', label: 'Zoom in' },
      { key: '- / _', label: 'Zoom out' },
      { key: '0', label: 'Reset zoom' },
      { key: 'Tab', label: 'Center view on cursor' },
      { key: 'Escape', label: 'Close dialog' },
    ],
  },
];
