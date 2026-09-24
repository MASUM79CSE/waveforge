// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { render } from 'preact';
import { Modal } from '../../../src/app/components/Modal';

/** Preact defers effects to rAF; jsdom (pretendToBeVisual) fires rAF on the next frame tick. */
function flushEffects(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

function pressTab(target: Element, shiftKey = false): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }),
  );
}

describe('M7 a11y: Modal focus trap', () => {
  test('initial focus lands on the first focusable; Tab wraps; unmount restores focus', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const before = document.createElement('button');
    before.textContent = 'opener';
    document.body.appendChild(before);
    before.focus();
    expect(document.activeElement).toBe(before);

    render(
      <Modal title="Demo dialog" onClose={() => undefined}>
        <button>Alpha</button>
        <button>Beta</button>
      </Modal>,
      host,
    );
    await flushEffects();

    const panel = host.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel).not.toBeNull();
    // initial focus: first focusable inside the panel (the close button)
    const closeBtn = panel.querySelector('.modal-close') as HTMLElement;
    const beta = [...panel.querySelectorAll('button')].find((b) => b.textContent === 'Beta')!;
    expect(document.activeElement).toBe(closeBtn);

    // Tab from the LAST focusable wraps to the first
    beta.focus();
    pressTab(beta);
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab from the FIRST focusable wraps to the last
    closeBtn.focus();
    pressTab(closeBtn, true);
    expect(document.activeElement).toBe(beta);

    // unmount restores focus to the previously focused element
    render(null, host);
    expect(document.activeElement).toBe(before);
  });

  test('modal with no user content still focuses its close button (first focusable)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    render(
      <Modal title="Empty" onClose={() => undefined}>
        <p>nothing focusable here</p>
      </Modal>,
      host,
    );
    await flushEffects();
    const closeBtn = host.querySelector('.modal-close') as HTMLElement;
    expect(document.activeElement).toBe(closeBtn);
    render(null, host);
  });
});
