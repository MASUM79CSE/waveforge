// UX-2.4 — overflow primitive core (pure planning; DOM measures capacity).
// Contract: items carry priority 1..n (1 = LAST to overflow, i.e. most
// important). `overflowPlan` keeps the first `capacity` items by priority
// order (stable by original index within equal priority) and returns the
// rest as hidden; hidden ids render inside the ⋯ popup in priority order.
// capacity 0 → everything hidden; capacity ≥ n → nothing hidden.

import { describe, expect, test } from 'vitest';
import { overflowPlan, type OverflowItem } from '../../src/app/frame2/overflow';

const item = (id: string, priority: number): OverflowItem => ({ id, priority });

describe('frame2 overflow core', () => {
  const items: OverflowItem[] = [
    item('a', 2),
    item('b', 1), // most important
    item('c', 3),
    item('d', 2),
  ];

  test('keeps the highest-priority items, hides the rest', () => {
    const plan = overflowPlan(items, 2);
    expect(plan.visible).toEqual(['b', 'a']); // priority 1 then 2 (stable by index)
    expect(plan.hidden).toEqual(['d', 'c']); // priority 2 (later index) then 3
  });

  test('capacity 0 hides everything; capacity ≥ n hides nothing', () => {
    expect(overflowPlan(items, 0)).toEqual({ visible: [], hidden: ['b', 'a', 'd', 'c'] });
    expect(overflowPlan(items, 4).hidden).toEqual([]);
    expect(overflowPlan(items, 9).hidden).toEqual([]);
  });

  test('equal priority keeps original order', () => {
    const eq = [item('x', 1), item('y', 1), item('z', 1)];
    const plan = overflowPlan(eq, 2);
    expect(plan.visible).toEqual(['x', 'y']);
    expect(plan.hidden).toEqual(['z']);
  });

  test('empty item list yields an empty plan', () => {
    expect(overflowPlan([], 3)).toEqual({ visible: [], hidden: [] });
  });
});
