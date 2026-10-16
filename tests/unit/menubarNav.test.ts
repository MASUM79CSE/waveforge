import { describe, expect, it } from 'vitest';
import { menuStep, titleStep, typeaheadStep } from '../../src/app/menubarNav';

describe('menubar title navigation (roving, wraps)', () => {
  const titles = ['file', 'edit', 'view', 'tools', 'time', 'help'];

  it('moves right and left with wrap-around', () => {
    expect(titleStep(titles, 'file', 1)).toBe('edit');
    expect(titleStep(titles, 'help', 1)).toBe('file'); // wrap forward
    expect(titleStep(titles, 'file', -1)).toBe('help'); // wrap backward
    expect(titleStep(titles, 'edit', -1)).toBe('file');
  });

  it('falls back to the first title when current is absent', () => {
    expect(titleStep(titles, 'nope', 1)).toBe('file');
  });

  it('is stable for a single title', () => {
    expect(titleStep(['only'], 'only', 1)).toBe('only');
  });
});

describe('in-menu item navigation (wraps, no disabled concept)', () => {
  const items = ['fileOpen', 'fileUrl', 'fileSample', 'fileExport'];

  it('cycles down and up with wrap', () => {
    expect(menuStep(items, 'fileOpen', 1)).toBe('fileUrl');
    expect(menuStep(items, 'fileExport', 1)).toBe('fileOpen'); // wrap
    expect(menuStep(items, 'fileOpen', -1)).toBe('fileExport'); // wrap
  });

  it('falls back to the first item when current is absent', () => {
    expect(menuStep(items, 'gone', 1)).toBe('fileOpen');
  });
});

describe('typeahead (first-char, forward scan from current, wraps)', () => {
  const items = ['fileOpen', 'fileUrl', 'fileSample', 'fileExport'];

  it('jumps to the next item starting with the character', () => {
    expect(typeaheadStep(items, 'fileOpen', 'f', (id) => id)).toBe('fileUrl'); // skip self, scan forward
    expect(typeaheadStep(items, 'fileUrl', 'e', (id) => id.slice(4))).toBe('fileExport');
  });

  it('wraps around the end of the menu', () => {
    expect(typeaheadStep(items, 'fileExport', 'f', (id) => id)).toBe('fileOpen');
  });

  it('returns null when nothing matches', () => {
    expect(typeaheadStep(items, 'fileOpen', 'z', (id) => id)).toBeNull();
  });
});
