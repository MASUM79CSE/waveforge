import { expect, test } from '@playwright/test';

/**
 * E1 mastering e2e (effects v2 plan §8.8): LUFS Normalize and the
 * true-peak Limiter apply through the real menu/dialog on demo.wav.
 * Both kernels are length-preserving — the status bar duration must not
 * change; toasts confirm the committed edit.
 */

async function loadSample(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

async function applyEffect(
  page: import('@playwright/test').Page,
  label: RegExp,
): Promise<void> {
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: label }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Apply' }).click();
}

test('effects: LUFS Normalize applies at full length', async ({ page }) => {
  await loadSample(page);
  await applyEffect(page, /LUFS Normalize/i);
  // undoable edit commit + toast, duration untouched (9.27 s demo)
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied/i, {
    timeout: 15_000,
  });
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
  // the edit is on the undo stack (app undo shortcut: Shift+Z / Z)
  await page.keyboard.press('Shift+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
});

test('effects: true-peak Limiter applies and undoes cleanly', async ({ page }) => {
  await loadSample(page);
  await applyEffect(page, /^Hard Limiter/);
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied/i, {
    timeout: 15_000,
  });
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
  await page.keyboard.press('Shift+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
});
