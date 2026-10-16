/**
 * frame2 overflow primitive core (UX-2.4) — decides which controls stay in a
 * band and which fold into the ⋯ popup. Pure planning: the DOM wrapper
 * measures how many items fit (`capacity`) and renders the plan. Priority 1
 * is the most important (last to overflow); ties keep original order, so
 * plans are deterministic for tests.
 */

export interface OverflowItem {
  id: string;
  priority: number;
}

export interface OverflowPlan {
  visible: string[];
  hidden: string[];
}

export function overflowPlan(items: OverflowItem[], capacity: number): OverflowPlan {
  const order = items
    .map((it, index) => ({ ...it, index }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index);
  const visible: string[] = [];
  const hidden: string[] = [];
  order.forEach((it, rank) => {
    if (rank < capacity) visible.push(it.id);
    else hidden.push(it.id);
  });
  return { visible, hidden };
}
