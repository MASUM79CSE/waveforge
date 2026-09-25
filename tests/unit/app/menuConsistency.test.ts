// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { foldMenuItems, menus, type MenuItemDef } from '../../../src/app/menus';
import { commands } from '../../../src/app/commands';

describe('M9e menu/command consistency', () => {
  test('every menu item resolves to a registered command', () => {
    const ids = new Set(commands.map((c) => c.id));
    for (const menu of menus) {
      const walk = (item: MenuItemDef): void => {
        if (item === '-') return;
        if (typeof item === 'string') {
          expect(ids.has(item), `menu "${menu.id}" references unknown command "${item}"`).toBe(true);
          return;
        }
        for (const child of item.items) walk(child);
      };
      for (const item of menu.items) walk(item);
    }
  });

  test('the Edit menu carries the arrangement commands (M9d2)', () => {
    const edit = menus.find((m) => m.id === 'edit')!;
    expect(edit.items).toContain('clip.split');
    expect(edit.items).toContain('clip.duplicate');
    expect(edit.items).toContain('clip.delete');
  });
});

describe('grouped menus (effects / file / view)', () => {
  const effects = menus.find((m) => m.id === 'effects')!;

  test('g11: every non-rack effect lives in exactly one labelled group; no duplicates', () => {
    const grouped: string[] = [];
    const headers = effects.items.filter((i) => i !== '-' && typeof i !== 'string');
    for (const group of headers) {
      for (const id of (group as { items: string[] }).items) {
        grouped.push(id);
        expect(ids(id), `${id} must be a registered command`).toBe(true);
      }
    }
    expect(new Set(grouped).size).toBe(grouped.length); // no duplicates
    // every fx.* command except the rack is organized into a group
    const rack = new Set(['fx.rack']);
    const allFx = commands.map((c) => c.id).filter((id) => id.startsWith('fx.'));
    for (const id of allFx) {
      if (rack.has(id)) continue;
      expect(grouped).toContain(id);
    }
  });

  test('g12: foldMenuItems wraps group members and passes bare rows through', () => {
    const rows = foldMenuItems(['fx.rack', '-', { header: () => 'Dyn', items: ['fx.gate', 'fx.deesser'] }], (id) => id);
    expect(rows[0]).toMatchObject({ kind: 'command', id: 'fx.rack', group: undefined });
    expect(rows[1]).toMatchObject({ kind: 'separator' });
    expect(rows[2]).toMatchObject({ kind: 'header', label: 'Dyn', group: 0 });
    expect(rows[3]).toMatchObject({ kind: 'command', id: 'fx.gate', group: 0 });
    expect(rows[4]).toMatchObject({ kind: 'command', id: 'fx.deesser', group: 0 });
    expect(rows).toHaveLength(5);
  });
});

test('g13: file + view menus are fully grouped, no duplicates', () => {
  for (const menuId of ['file', 'view']) {
    const menu = menus.find((m) => m.id === menuId)!;
    const grouped: string[] = [];
    for (const item of menu.items) {
      expect(item !== '-' && typeof item !== 'string', `${menuId} uses labelled groups`).toBe(true);
      for (const id of (item as { items: string[] }).items) {
        grouped.push(id);
        expect(ids(id), `${menuId}:${id} registered`).toBe(true);
      }
    }
    expect(new Set(grouped).size).toBe(grouped.length);
    // the menu references every command of its namespace, all grouped
    const prefix = menuId === 'file' ? ['file.', 'record.'] : ['view.'];
    const expected = commands.map((c) => c.id).filter((id) => prefix.some((p) => id.startsWith(p)));
    for (const id of expected) {
      expect(grouped, `${menuId} groups ${id}`).toContain(id);
    }
  }
});

function ids(id: string): boolean {
  return commands.some((c) => c.id === id);
}
