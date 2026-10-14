import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * PF-08: dockable detached panels — the analysis panel detaches into a
 * floating window, drags by its header (pointer), moves with arrow keys
 * from the handle, survives dragging clamped inside the viewport, and
 * docks back via the Dock button or Escape inside the panel. The panel
 * stays functional (live spectrum) while detached.
 */

async function loadSample(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

async function openPanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Analyze' }).click();
  await page.getByRole('menuitem', { name: /spectrum panel/i }).click();
  await expect(page.locator('.analysis-panel')).toBeVisible();
}

async function panelBox(page: Page): Promise<{ x: number; y: number }> {
  const b = await page.locator('.analysis-panel').boundingBox();
  if (!b) throw new Error('panel not rendered');
  return { x: b.x, y: b.y };
}

test('panel detaches, drags, keyboard-moves, and docks back', async ({ page }) => {
  await loadSample(page);
  await openPanel(page);

  // docked: no floating class, no handle
  await expect(page.locator('.analysis-panel-float')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /move panel/i })).toBeHidden();

  // detach
  await page.getByTestId('panel-detach-toggle').click();
  const float = page.locator('.analysis-panel-float');
  await expect(float).toBeVisible();
  await expect(page.getByRole('button', { name: /move panel/i })).toBeVisible();

  // pointer-drag the header by (+120, +70)
  const before = await panelBox(page);
  const head = float.locator('.analysis-panel-head');
  const hb = (await head.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 10);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 120, hb.y + 10 + 70, { steps: 5 });
  await page.mouse.up();
  const afterDrag = await panelBox(page);
  expect(afterDrag.x - before.x).toBeGreaterThanOrEqual(100);
  expect(afterDrag.y - before.y).toBeGreaterThanOrEqual(50);

  // keyboard move from the handle: ArrowLeft x2 (16 px steps)
  const handle = page.getByRole('button', { name: /move panel/i });
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  const afterKeys = await panelBox(page);
  expect(afterDrag.x - afterKeys.x).toBeCloseTo(32, 0);
  expect(afterKeys.y).toBeCloseTo(afterDrag.y, 0);

  // the panel is still functional while floating
  await expect(page.locator('.analysis-spectrum').isVisible()).resolves.toBe(true);

  // dock via the button
  await page.getByTestId('panel-detach-toggle').click();
  await expect(page.locator('.analysis-panel-float')).toHaveCount(0);

  // docked panel is back at the docked position
  const docked = await panelBox(page);
  expect(docked.y).not.toBeCloseTo(afterKeys.y, 0);
});

test('Escape inside a detached panel docks it', async ({ page }) => {
  await loadSample(page);
  await openPanel(page);

  await page.getByTestId('panel-detach-toggle').click();
  await expect(page.locator('.analysis-panel-float')).toBeVisible();

  // focus inside the panel, then Escape
  await page.getByRole('button', { name: /move panel/i }).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.analysis-panel-float')).toHaveCount(0);
  // the panel itself stays open (Escape docked it, it did not close it)
  await expect(page.locator('.analysis-panel')).toBeVisible();
});
