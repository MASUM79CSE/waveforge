/**
 * Band overflow (UX-3.3) — measures the band and folds whole sections
 * (`[data-f2-item]`, lowest `data-priority` first) into the band's ⋯ menu
 * when they do not fit. Natural widths are remembered so sections can
 * unfold on growth; a ResizeObserver re-runs the plan.
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

const RESERVED_PX = 44; // the ⋯ button + gap

export function useBandOverflow(bandRef: RefObject<HTMLElement>, itemIds: string[]): string[] {
  const [folded, setFolded] = useState<string[]>([]);
  const foldedRef = useRef<string[]>([]);
  const naturals = useRef(new Map<string, number>());

  const tick = useCallback(() => {
    const el = bandRef.current;
    if (!el) return;
    // ≤480 stacks (flex-wrap) — folding is disabled there (CSS @media)
    if (window.matchMedia('(max-width: 480px)').matches) {
      if (foldedRef.current.length > 0) {
        foldedRef.current = [];
        setFolded([]);
      }
      return;
    }
    const sections = [...el.querySelectorAll<HTMLElement>('[data-f2-item]')];
    if (sections.length === 0) return;
    const avail = Math.max(0, el.clientWidth - RESERVED_PX);

    // remember intrinsic widths while a section is visible (fold/unfold does
    // not change a nowrap section's natural width, so the last known value
    // stays valid for hidden ones)
    for (const s of sections) {
      if (!s.classList.contains('f2-folded')) {
        naturals.current.set(s.dataset.f2Item ?? '', s.offsetWidth);
      }
    }
    const nat = (id: string): number => naturals.current.get(id) ?? 0;
    const prio = new Map(sections.map((s) => [s.dataset.f2Item ?? '', Number(s.dataset.priority ?? '9')]));

    // CLOSED-LOOP plan: always restart from all-visible. Fold lowest
    // priority first until the row fits. Rebuilt from scratch every tick, so
    // the result is idempotent (no fold/unfold oscillation).
    const visibleSet = new Set(itemIds);
    let total = itemIds.reduce((w, id) => w + nat(id), 0);
    const foldOrder = [...itemIds].sort((a, b) => (prio.get(b) ?? 9) - (prio.get(a) ?? 9));
    for (const id of foldOrder) {
      if (total <= avail) break;
      visibleSet.delete(id);
      total -= nat(id);
    }
    const next = itemIds.filter((id) => !visibleSet.has(id));

    if (next.join() !== foldedRef.current.join()) {
      foldedRef.current = next;
      setFolded(next);
    }
  }, [bandRef, itemIds]);

  useEffect(() => {
    const el = bandRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => tick());
    ro.observe(el);
    // window resizes can land between layout and the RO callback in some
    // engines — a debounced re-tick makes the plan deterministic.
    let t: ReturnType<typeof setTimeout> | null = null;
    const onResize = (): void => {
      tick();
      if (t) clearTimeout(t);
      t = setTimeout(() => tick(), 250);
    };
    window.addEventListener('resize', onResize);
    tick();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      if (t) clearTimeout(t);
    };
  }, [bandRef, tick]);

  return folded;
}
