/**
 * Delegated tooltips (D10): any element with `data-tip` gets a styled
 * tooltip — one fixed-position host node, positioned above the target's
 * rect so it escapes overflow-clipped ancestors (the scrolling control
 * row). Keyboard focus shows it too (focusin/focusout).
 */
export function bindTooltips(root: ParentNode = document): () => void {
  let el: HTMLDivElement | null = null;

  const host = (): HTMLDivElement => {
    if (!el) {
      el = document.createElement('div');
      el.className = 'gtip';
      el.setAttribute('role', 'tooltip');
      document.body.appendChild(el);
    }
    return el;
  };

  const show = (target: Element): void => {
    const text = target.getAttribute('data-tip');
    if (!text) return;
    const tip = host();
    tip.textContent = text;
    const r = target.getBoundingClientRect();
    tip.style.left = `${Math.round(r.left + r.width / 2)}px`;
    tip.style.top = `${Math.round(Math.max(30, r.top - 8))}px`;
    tip.dataset.on = '1';
  };

  const hide = (): void => {
    if (el) delete el.dataset.on;
  };

  const over = (e: Event): void => {
    const t = (e.target as Element | null)?.closest?.('[data-tip]');
    if (t) show(t);
    else hide();
  };
  const out = (e: Event): void => {
    if ((e.target as Element | null)?.closest?.('[data-tip]')) hide();
  };

  root.addEventListener('pointerover', over);
  root.addEventListener('pointerout', out);
  root.addEventListener('focusin', over);
  root.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, true);
  return () => {
    root.removeEventListener('pointerover', over);
    root.removeEventListener('pointerout', out);
    root.removeEventListener('focusin', over);
    root.removeEventListener('focusout', hide);
    window.removeEventListener('scroll', hide, true);
    el?.remove();
    el = null;
  };
}
