/**
 * CB-5.1 priority-collapse: the v2 row's container width as a signal.
 * A ResizeObserver on the `.cb2` root keeps `rowWidth` current; ControlBar
 * relocates zones (row ⇄ ⋮ panel) from the measured breakpoints. Single
 * instance per zone — relocation unmounts/remounts, no duplicates.
 */
import { signal } from '@preact/signals';

export const rowWidth = signal(0);

/**
 * Measured content widths (E-CB-019 recon): master ≈611, toolbar ≈553,
 * selection ≈258, tempo ≈211, record ≈177 (all incl. one gap). A zone
 * tucks into the ⋮ panel when the container is narrower than its
 * cumulative budget. Never tucked: transport+clock, the ⋮ trigger.
 */
export const TUCK = {
  seek: 430,
  master: 2150,
  record: 1540,
  tempo: 1360,
  selection: 1150,
  tool: 890,
} as const;

/** Attach the width tracker (ref callback — first read is synchronous). */
export function trackRowWidth(el: HTMLDivElement | null): void {
  if (!el) return;
  rowWidth.value = el.clientWidth;
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) rowWidth.value = e.contentRect.width;
  });
  ro.observe(el);
}
