// UX-2.3 — toolbar-group visibility manager (pure core + guarded storage).
// Contract: 5 groups (transport, edit, tools, timenap, meters), default ALL
// visible; toggle flips one; reset restores defaults; persisted JSON under
// `waveforge.frame2.toolbars` (flag's storage namespace) — garbage/absent
// storage normalizes to defaults; unknown ids ignored; Reset clears storage.
// @vitest-environment jsdom

import { afterEach, describe, expect, test } from 'vitest';
import {
  FRAME2_TOOLBAR_GROUPS,
  TOOLBAR_STORE_KEY,
  loadVisibility,
  normalizeVisibility,
  resetVisibilityStore,
  toggleGroup,
  type VisibilityMap,
} from '../../src/app/frame2/visibility';

afterEach(() => {
  localStorage.removeItem(TOOLBAR_STORE_KEY);
});

describe('frame2 visibility core', () => {
  test('group set is exactly the five IA.md §2 groups', () => {
    expect([...FRAME2_TOOLBAR_GROUPS].sort()).toEqual(['edit', 'meters', 'timenap', 'tools', 'transport']);
  });

  test('normalize: missing/partial/unknown entries default to visible', () => {
    expect(normalizeVisibility({})).toEqual({ transport: true, edit: true, tools: true, timenap: true, meters: true });
    expect(normalizeVisibility({ edit: false } as Partial<VisibilityMap>)).toEqual({
      transport: true, edit: false, tools: true, timenap: true, meters: true,
    });
    expect(
      normalizeVisibility({ transport: false, bogus: false } as unknown as Partial<VisibilityMap>),
    ).toEqual({ transport: false, edit: true, tools: true, timenap: true, meters: true });
  });

  test('toggleGroup flips only the target group', () => {
    const v = toggleGroup(normalizeVisibility({}), 'tools');
    expect(v.tools).toBe(false);
    expect(v.transport).toBe(true);
    expect(toggleGroup(v, 'tools').tools).toBe(true);
  });

  test('loadVisibility: no storage → all visible; garbage → all visible', () => {
    expect(loadVisibility(() => null).edit).toBe(true);
    localStorage.setItem(TOOLBAR_STORE_KEY, 'garbage{');
    expect(loadVisibility((k) => localStorage.getItem(k)).tools).toBe(true);
  });

  test('loadVisibility: persisted false survives round-trip; unknown ids ignored', () => {
    localStorage.setItem(TOOLBAR_STORE_KEY, JSON.stringify({ edit: false, nope: true }));
    const v = loadVisibility((k) => localStorage.getItem(k));
    expect(v.edit).toBe(false);
    expect(Object.keys(v).sort()).toEqual(['edit', 'meters', 'timenap', 'tools', 'transport']);
  });

  test('resetVisibilityStore clears storage', () => {
    localStorage.setItem(TOOLBAR_STORE_KEY, JSON.stringify({ edit: false }));
    const v = resetVisibilityStore(() => localStorage.removeItem(TOOLBAR_STORE_KEY));
    expect(localStorage.getItem(TOOLBAR_STORE_KEY)).toBeNull();
    expect(v.edit).toBe(true);
  });
});
