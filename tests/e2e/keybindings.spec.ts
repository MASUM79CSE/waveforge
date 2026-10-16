import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * AM-14: reference key bindings — Ctrl+S / Shift+S open the export dialog
 * (reference KeyModSave/KeyShiftSave) and bare X runs the crossfade command
 * (reference KeyCrossfade). Mapping is unit-proven (shortcuts.test.ts); this
 * spec proves the app wiring end-to-end. Tab is intentionally unbound
 * (focus traversal stays with the browser — a11y).
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

test('Ctrl+S opens the export dialog', async ({ page }) => {
  await loadSample(page);
  await page.keyboard.press('Control+s');
  const dialog = page.getByRole('dialog', { name: /export/i });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('bare X routes to the crossfade command (single clip ⇒ the no-adjacent toast)', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Add track', exact: true }).click(); // project mode
  await page.keyboard.press('x');
  await expect(page.locator('.toast-msg').last()).toHaveText('No adjacent clip to crossfade');
});
