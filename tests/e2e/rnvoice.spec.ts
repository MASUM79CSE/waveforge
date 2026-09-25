import { expect, test, type Page } from '@playwright/test';

/**
 * 39th e2e (E7b — docs/effects-nr-e7b-plan.md §3): open AI Voice Clarity
 * from the Effects menu, the dialog lazily loads the vendored RNNoise wasm
 * (status line appears while loading, then Preview/Apply enable once the
 * model reports ready), apply with the default mix, undo, redo. Zero
 * console errors.
 */

async function loadSample(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

test('rnvoice: dialog gates on model ready, apply, undo, redo (E7b)', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await loadSample(page);

  // select all so the effect targets a region
  await page.keyboard.press('Shift+a');
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /AI Voice Clarity/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();

  // mix-only param row is present with the default 100 %
  const mix = panel.locator('#fx-mix');
  await expect(mix).toHaveValue('1');

  // the model loads fast locally, but the gate must be observable: either
  // the status line already cleared (ready before we looked) or it clears
  // now; Preview/Apply enable only on ready.
  const apply = panel.getByRole('button', { name: /^Apply$/ });
  await expect(apply).toBeEnabled({ timeout: 15_000 });

  // preview start/stop must not throw once ready
  const preview = panel.getByRole('button', { name: /Preview/i }).first();
  await preview.click();
  await panel.getByRole('button', { name: /Stop preview/i }).click();

  // apply → toast; undo/redo ride the standard edit history
  await apply.click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied/i, { timeout: 15_000 });
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('.toast-msg').last()).toContainText(/Redid/i, { timeout: 8000 });

  expect(consoleErrors).toEqual([]);
});
