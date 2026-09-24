import { expect, test } from '@playwright/test';

test('doctor: Help → Diagnostics runs capability self-tests and reports', async ({ page }) => {
  await page.goto('/');
  // dismiss welcome
  await page.getByRole('dialog', { name: /welcome/i }).getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: /Diagnostics/i }).click();

  const panel = page.getByRole('dialog', { name: /Diagnostics/i });
  await expect(panel).toBeVisible();
  const rows = panel.locator('tbody tr');
  await expect(rows.filter({ hasText: /WebAudio/i })).toBeVisible({ timeout: 15_000 });
  // all capability checks eventually resolve (9 checks + error-log row)
  await expect(rows).toHaveCount(10, { timeout: 15_000 });
  // browser capabilities pass in Chromium
  for (const id of ['webaudio', 'worklet', 'indexeddb', 'wasm', 'compression', 'storage', 'fetch']) {
    const row = rows.filter({ hasText: new RegExp(id, 'i') }).first();
    await expect(row).toContainText('✔');
  }
  // error-log row shows 0 entries and a disabled export button
  const logRow = rows.filter({ hasText: /Local error log/i });
  await expect(logRow).toContainText('0 entries');
  await expect(logRow.getByRole('button', { name: /export json/i })).toBeDisabled();
});
