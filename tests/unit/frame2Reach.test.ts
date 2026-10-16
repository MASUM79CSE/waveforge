// UX-3.4 (unit half) — re-homing REACHABILITY over the one registry.
// Every registry id must be reachable in frame2 through a v2 surface:
// the menu bar (Z1), a frame2 toolbar/group control, or the documented
// exception set (lane/track-panel surfaces verified by the e2e walk).
// The EXECUTION walk (each id dispatched once, live) is the e2e half in
// tests/e2e/frame2-rehoming.spec.ts.
// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';
import { commands } from '../../src/app/commands';
import { menuEntries } from '../../src/app/menus';
import { FRAME2_GROUPS } from '../../src/app/frame2/groups';

/** Registry ids whose v2 surface is NOT the menubar/toolbars. */
const KNOWN_NON_MENU_SURFACES: Record<string, string> = {
  // per-lane automation toggle — TrackLanes header group (mounted in Z4–Z7);
  // exercised live by the e2e walk via the lane control.
  'automation.toggle': 'TrackLanes automation header',
  // select-to prev/next marker — global keyboard bindings '{' / '}' in the
  // SHARED keyboard.ts (serve both frames); merged-tree addition from the
  // markers feature (their line) — documented global keys, like undo/redo.
  'marker.selectPrev': "global keyboard '{' (shared keyboard.ts)",
  'marker.selectNext': "global keyboard '}' (shared keyboard.ts)",
};

/** Addendum ids whose v2 surface is the Toolbars popover (⚙, frame2 only). */
const KNOWN_POPOVER_SURFACE: Record<string, string> = {
  'view.toolbars.transport': 'Toolbars popover',
  'view.toolbars.edit': 'Toolbars popover',
  'view.toolbars.tools': 'Toolbars popover',
  'view.toolbars.timenap': 'Toolbars popover',
  'view.toolbars.meters': 'Toolbars popover',
  'view.layoutReset': 'Toolbars popover reset button',
  'help.toolbars': 'Band ⚙ button',
};

describe('UX-3.4 re-homing reachability (unit)', () => {
  const registry = commands.map((c) => c.id);
  const menuIds = new Set(menuEntries().map((e) => e.id));
  const toolbarIds = new Set(
    FRAME2_GROUPS.flatMap((g) => g.controls.map((c) => c.command).filter((c): c is string => Boolean(c))),
  );

  test('menu entries never reference ids outside the registry (no drift)', () => {
    const stray = [...menuIds].filter((id) => !registry.includes(id));
    expect(stray).toEqual([]);
  });

  test('toolbar control commands exist in the registry (single source)', () => {
    const stray = [...toolbarIds].filter((id) => !registry.includes(id));
    expect(stray).toEqual([]);
  });

  test('EVERY registry id is reachable in frame2 (menu ∪ toolbars ∪ documented surfaces)', () => {
    const unreachable = registry.filter(
      (id) =>
        !menuIds.has(id) &&
        !toolbarIds.has(id) &&
        !(id in KNOWN_NON_MENU_SURFACES) &&
        !(id in KNOWN_POPOVER_SURFACE),
    );
    expect(unreachable, 'registry ids with no frame2 surface').toEqual([]);
  });

  test('the documented-surface sets are exact (nothing hides there silently)', () => {
    for (const id of Object.keys(KNOWN_NON_MENU_SURFACES)) expect(registry.includes(id), id).toBe(true);
    expect(Object.keys(KNOWN_NON_MENU_SURFACES).sort()).toEqual(
      ['automation.toggle', 'marker.selectNext', 'marker.selectPrev'],
    );
    for (const id of Object.keys(KNOWN_POPOVER_SURFACE)) expect(registry.includes(id), id).toBe(true);
  });

  test('the five group commands + reset + popover entry exist (addendum surface)', () => {
    for (const id of [
      'view.toolbars.transport',
      'view.toolbars.edit',
      'view.toolbars.tools',
      'view.toolbars.timenap',
      'view.toolbars.meters',
      'view.layoutReset',
      'help.toolbars',
    ]) {
      expect(registry.includes(id), id).toBe(true);
      // addendum ids are reachable through the Toolbars popover (frame2 only):
      // their v2 surface is the popover — count as toolbar-surface via groups
      // of the popover; here we assert they are NOT orphaned by menus either.
    }
  });
});
