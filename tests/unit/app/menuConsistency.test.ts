// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { menus } from '../../../src/app/menus';
import { commands } from '../../../src/app/commands';

describe('M9e menu/command consistency', () => {
  test('every menu item resolves to a registered command', () => {
    const ids = new Set(commands.map((c) => c.id));
    for (const menu of menus) {
      for (const item of menu.items) {
        if (item === '-') continue;
        expect(ids.has(item), `menu "${menu.id}" references unknown command "${item}"`).toBe(true);
      }
    }
  });

  test('the Edit menu carries the arrangement commands (M9d2)', () => {
    const edit = menus.find((m) => m.id === 'edit')!;
    expect(edit.items).toContain('clip.split');
    expect(edit.items).toContain('clip.duplicate');
    expect(edit.items).toContain('clip.delete');
  });
});
