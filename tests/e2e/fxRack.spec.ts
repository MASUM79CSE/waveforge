import { expect, test, type Page } from '@playwright/test';

/**
 * C4 — FX Rack e2e (docs/fxchains-plan.md). 40th: add two effects, reorder,
 * bypass one, preview, apply (ONE history entry), undo, redo — console-
 * clean. 41st: the Voice rescue built-in recipe (E7b rnvoice → deesser →
 * compressor) loads from the preset select and applies; undo.
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

async function openRack(page: Page): Promise<void> {
  await page.keyboard.press('Shift+a');
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /FX Rack/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('fx rack: add, reorder, bypass, apply once, undo, redo (C2)', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await loadSample(page);
  await openRack(page);
  const panel = page.getByRole('dialog');

  // add Tremolo, then Delay — two ordered entries
  await panel.locator('#rack-add-select').selectOption('fx.tremolo');
  await panel.getByTestId('rack-add').click();
  await panel.locator('#rack-add-select').selectOption('fx.delay');
  await panel.getByTestId('rack-add').click();
  await expect(panel.getByTestId('rack-row-0')).toContainText(/Tremolo/i);
  await expect(panel.getByTestId('rack-row-1')).toContainText(/Delay/i);

  // reorder: move Delay (row 1) up
  await panel.getByTestId('rack-row-1').locator('.rack-move').first().click();
  await expect(panel.getByTestId('rack-row-0')).toContainText(/Delay/i);

  // bypass Tremolo (row 1 now)
  await panel.getByTestId('rack-row-1').locator('input[type="checkbox"]').check();
  await expect(panel.getByTestId('rack-row-1').locator('input[type="checkbox"]')).toBeChecked();

  // whole-chain A/B preview renders offline and starts/stops clean
  await panel.getByRole('button', { name: /Preview/i }).first().click();
  await panel.getByRole('button', { name: /Stop preview/i }).click();

  // apply = ONE history entry
  await panel.getByTestId('rack-apply').click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied.*FX Rack/i, {
    timeout: 20_000,
  });
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('.toast-msg').last()).toContainText(/Redid/i, { timeout: 8000 });

  expect(consoleErrors).toEqual([]);
});

test('voice rescue preset: rnvoice → deesser → compressor applies from the rack (C3)', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await loadSample(page);
  await openRack(page);
  const panel = page.getByRole('dialog');

  await panel.locator('[data-testid="rack-presets"] select').selectOption('builtin:voiceRescue');
  await panel.getByRole('button', { name: /Load/i }).click();
  await expect(panel.getByTestId('rack-row-0')).toContainText(/AI Voice Clarity/i);
  await expect(panel.getByTestId('rack-row-1')).toContainText(/De-?esser/i);
  await expect(panel.getByTestId('rack-row-2')).toContainText(/Compressor/i);

  await panel.getByTestId('rack-apply').click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied.*FX Rack/i, {
    timeout: 30_000,
  });
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });

  expect(consoleErrors).toEqual([]);
});
