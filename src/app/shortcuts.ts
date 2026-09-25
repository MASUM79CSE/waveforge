/**
 * Global shortcut table (UX hardening): professional standard combos with
 * the legacy shift-letter set preserved for muscle memory.
 *
 * Pure module — `resolveShortcut` maps a key event to a command id; the
 * browser glue in keyboard.ts runs the command and calls preventDefault.
 * Menu hints come from `kbdHints` (⌘ glyphs on macOS, Ctrl elsewhere).
 */

/** Minimal shape of a keyboard event (duck-typed for pure testing). */
export interface ShortcutEvent {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

/** Command ids the shortcut layer may resolve to. */
export type ShortcutCommand =
  | 'file.open'
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.cut'
  | 'edit.copy'
  | 'edit.paste'
  | 'edit.selectAll'
  | 'edit.insertSilence'
  | 'clip.split'
  | 'clip.delete'
  | 'clip.duplicate'
  | 'automation.toggle'
  | 'record.toggle'
  | 'record.punch'
  | 'record.monitor'
  | 'record.metronome';

function isMacLike(): boolean {
  return typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform ?? '');
}

/**
 * Resolve a key event to a command id, or null when the combo is not
 * mapped (the browser keeps it). Rules:
 *  - typing guards are the caller's job (inputs/contentEditable);
 *  - Alt combos always stay with the browser (menus, IME);
 *  - both 'z' and 'Z' match — real browsers deliver the shifted letter,
 *    synthesized/IME events may deliver the base letter + shiftKey.
 */
export function resolveShortcut(event: ShortcutEvent): ShortcutCommand | null {
  if (event.alt) return null;
  const key = event.key.toLowerCase();
  const mod = event.ctrl || event.meta;

  // R-series: bare letters (no modifier — modifier combos stay with the
  // browser). Single source here so menus/hints stay in sync.
  if (!mod) {
    if (key === 'r') return 'record.toggle';
    if (key === 'p') return 'record.punch';
    if (key === 'm') return 'record.metronome'; // BandLab parity: M = click
  }

  if (mod) {
    switch (key) {
      case 'z':
        return event.shift ? 'edit.redo' : 'edit.undo';
      case 'y':
        return 'edit.redo';
      case 'x':
        return 'edit.cut';
      case 'c':
        return 'edit.copy';
      case 'v':
        return 'edit.paste';
      case 'a':
        return 'edit.selectAll';
      case 'o':
        return 'file.open';
      case 'd':
        return 'clip.duplicate';
      default:
        return null;
    }
  }

  // arrangement plain keys (typing guards are the caller's job) — then the
  // legacy the reference editor shift-letter layer
  if (!event.shift) {
    switch (key) {
      case 's':
        return 'clip.split';
      case 'a':
        return 'automation.toggle';
      case 'delete':
      case 'backspace':
        return 'clip.delete';
      default:
        return null;
    }
  }
  switch (key) {
    case 'z':
      return 'edit.undo';
    case 'y':
      return 'edit.redo';
    case 'x':
      return 'edit.cut';
    case 'c':
      return 'edit.copy';
    case 'v':
      return 'edit.paste';
    case 'a':
      return 'edit.selectAll';
    case 'n':
      return 'edit.insertSilence';
    default:
      return null;
  }
}

export interface KbdHints {
  open: string;
  duplicateClip?: string;
  automation?: string;
  undo: string;
  redo: string;
  cut: string;
  copy: string;
  paste: string;
  selectAll: string;
  insertSilence: string;
}

/**
 * Menu display hints. Windows/Linux shows the Windows convention (Ctrl+Y
 * redo); macOS shows Adobe glyphs (⇧⌘Z — there is no ⌘Y convention).
 */
export function kbdHints(mac = isMacLike()): KbdHints {
  if (mac) {
    return {
      open: '⌘O',
      duplicateClip: '⌘D',
      automation: 'A',
      undo: '⌘Z',
      redo: '⇧⌘Z',
      cut: '⌘X',
      copy: '⌘C',
      paste: '⌘V',
      selectAll: '⌘A',
      insertSilence: '⇧N',
    };
  }
  return {
    open: 'Ctrl+O',
    duplicateClip: 'Ctrl+D',
    automation: 'A',
    undo: 'Ctrl+Z',
    redo: 'Ctrl+Y',
    cut: 'Ctrl+X',
    copy: 'Ctrl+C',
    paste: 'Ctrl+V',
    selectAll: 'Ctrl+A',
    insertSilence: 'Shift+N',
  };
}
