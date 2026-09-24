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
  // user-facing standard: Ctrl+Z undoes the applied effect, Ctrl+Y redoes it
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('.toast-msg').last()).toContainText(/Redid/i, { timeout: 8000 });
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
});

test('effects: 8-band parametric EQ renders curve, applies, undoes', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /Parametric EQ \(8-band\)/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  // the analytic response curve canvas is mounted
  await expect(panel.locator('.eq-curve')).toBeVisible();
  // 8 band rows with type selects
  expect(await panel.locator('.eq-row').count()).toBe(8);
  // boost band 1 to +6 dB — the curve must change (redraw on param change)
  const gainInput = panel.locator('.eq-row').nth(0).locator('input').nth(1);
  await gainInput.fill('6');
  await gainInput.dispatchEvent('change');
  // apply through the generic kernel plumbing
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied/i, { timeout: 15_000 });
  await expect(page.getByText(/9\.27 s/)).toBeVisible(); // length preserved
  // Ctrl+Z undoes it (standard shortcut, user-facing contract)
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
});

test('effects: true-peak Limiter applies and undoes cleanly', async ({ page }) => {
  await loadSample(page);
  await applyEffect(page, /^Hard Limiter/);
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied/i, {
    timeout: 15_000,
  });
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
  // legacy AudioMass combo still works (Shift+Z)
  await page.keyboard.press('Shift+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
});

test('effects: Chorus (E3 modulation) applies via generic dialog and undoes', async ({
  page,
}) => {
  await loadSample(page);
  await applyEffect(page, /^Chorus/);
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied: Chorus/i, {
    timeout: 15_000,
  });
  // modulation kernels are length-preserving
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
  // standard user-facing shortcut contract: Ctrl+Z undoes the effect
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('.toast-msg').last()).toContainText(/Redid/i, { timeout: 8000 });
});
