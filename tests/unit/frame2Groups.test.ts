// UX-3.1/3.2 — frame2 group definitions + visibility commands.
// Contract: frame2 bands host exactly the five IA.md §2 groups; every
// control with a `command` targets an existing registry id (single-registry
// rule); controls with legacy testids keep them; roving toolbars (role=
// toolbar) have ≥3 controls (APG rule); visibility commands flip persisted
// state; view.layoutReset restores all groups and clears storage.

// @vitest-environment jsdom

import { afterEach, describe, expect, test } from 'vitest';
import { commands, runCommand } from '../../src/app/commands';
import {
  FRAME2_GROUPS,
  FRAME2_TOOLBAR_ROLE_GROUPS,
  controlsOf,
  type Frame2GroupDef,
} from '../../src/app/frame2/groups';
import {
  FRAME2_TOOLBAR_GROUPS,
  TOOLBAR_STORE_KEY,
  reloadVisibility,
  visibility,
} from '../../src/app/frame2/visibilityStore';

afterEach(() => {
  localStorage.removeItem(TOOLBAR_STORE_KEY);
  runCommand('view.layoutReset');
  localStorage.removeItem(TOOLBAR_STORE_KEY);
});

describe('frame2 group definitions', () => {
  test('exactly the five IA.md §2 groups, in band order', () => {
    expect(FRAME2_GROUPS.map((g) => g.group)).toEqual(['transport', 'edit', 'tools', 'timenap', 'meters']);
  });

  test('every control command exists in the registry', () => {
    const registered = new Set(commands.map((c) => c.id));
    for (const g of FRAME2_GROUPS) {
      for (const c of controlsOf(g)) {
        if (c.command) expect(registered.has(c.command), c.command).toBe(true);
      }
    }
  });

  test('legacy testids are preserved on the controls that had them', () => {
    const tids = FRAME2_GROUPS.flatMap((g) => controlsOf(g).map((c) => c.testid).filter(Boolean));
    for (const t of [
      'transport-play',
      'transport-pause',
      'transport-stop',
      'transport-seek-back',
      'transport-seek-fwd',
      'record-toggle',
      'monitor-toggle',
      'punch-button',
    ]) {
      expect(tids).toContain(t);
    }
  });

  test('toolbar-role groups have ≥3 controls (APG); plain groups declare none', () => {
    for (const g of FRAME2_GROUPS) {
      const n = controlsOf(g).length;
      if (FRAME2_TOOLBAR_ROLE_GROUPS.includes(g.group)) expect(n).toBeGreaterThanOrEqual(3);
      else expect(g.toolbar).not.toBe(true);
    }
  });

  test('group defs are well-formed (unique control ids, priority in band)', () => {
    const ids = FRAME2_GROUPS.flatMap((g: Frame2GroupDef) => controlsOf(g).map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of FRAME2_GROUPS) expect(g.priority).toBeGreaterThanOrEqual(1);
  });
});

describe('frame2 visibility commands', () => {
  test('registry carries the addendum ids', () => {
    const registered = new Set(commands.map((c) => c.id));
    for (const id of [
      'view.layoutReset',
      'view.toolbars.transport',
      'view.toolbars.edit',
      'view.toolbars.tools',
      'view.toolbars.timenap',
      'view.toolbars.meters',
      'help.toolbars',
    ]) {
      expect(registered.has(id), id).toBe(true);
    }
  });

  test('view.toolbars.* flips the signal and persists', () => {
    expect(visibility.value.edit).toBe(true);
    runCommand('view.toolbars.edit');
    expect(visibility.value.edit).toBe(false);
    expect(JSON.parse(localStorage.getItem(TOOLBAR_STORE_KEY) ?? '{}')).toMatchObject({ edit: false });
    runCommand('view.toolbars.edit');
    expect(visibility.value.edit).toBe(true);
  });

  test('view.toolbars.* only affects its own group', () => {
    runCommand('view.toolbars.tools');
    expect(visibility.value.tools).toBe(false);
    expect(visibility.value.edit).toBe(true);
    expect(visibility.value.transport).toBe(true);
  });

  test('view.layoutReset restores all groups and clears storage', () => {
    runCommand('view.toolbars.transport');
    runCommand('view.toolbars.meters');
    expect(visibility.value.transport).toBe(false);
    runCommand('view.layoutReset');
    expect(visibility.value).toEqual({ transport: true, edit: true, tools: true, timenap: true, meters: true });
    expect(localStorage.getItem(TOOLBAR_STORE_KEY)).toBeNull();
  });

  test('visibility signal re-reads persisted storage on reload', () => {
    localStorage.setItem(TOOLBAR_STORE_KEY, JSON.stringify({ edit: false }));
    reloadVisibility();
    expect(visibility.value.edit).toBe(false);
    runCommand('view.toolbars.edit'); // toggle from reloaded state: false → true
    expect(visibility.value.edit).toBe(true);
    runCommand('view.toolbars.edit'); // and back
    expect(visibility.value.edit).toBe(false);
  });

  test('group set constant matches the visibility store', () => {
    expect(FRAME2_TOOLBAR_GROUPS).toEqual(FRAME2_GROUPS.map((g) => g.group));
  });
});
