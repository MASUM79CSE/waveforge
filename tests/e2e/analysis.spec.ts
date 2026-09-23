import { expect, test } from '@playwright/test';

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

/**
 * e2e flow #6 — analysis tools (M5): the spectrum panel mounts with live
 * canvas, LUFS measurement populates the readouts, and the Analyze menu
 * toggles persist.
 */
test('flow #6: spectrum panel + LUFS measurement', async ({ page }) => {
  await loadSample(page);

  await page.getByRole('button', { name: 'Analyze' }).click();
  await page.getByRole('menuitem', { name: /spectrum panel/i }).click();
  await expect(page.locator('.analysis-panel')).toBeVisible();
  await expect(page.locator('.analysis-spectrum')).toBeVisible();
  // readouts idle before a measurement
  await expect(page.locator('.analysis-panel').getByText('—').first()).toBeVisible();

  await page.getByRole('button', { name: 'Analyze' }).click();
  await page.getByRole('menuitem', { name: /loudness/i }).click();
  // toast confirms completion with a numeric LUFS value (toasts stack — take newest)
  await expect(page.locator('.toast-msg').last()).toContainText(/LUFS/, { timeout: 15_000 });
  // integrated readout now shows a number (not the idle dash)
  await expect(page.locator('.analysis-val').first()).not.toHaveText('—');

  // the menu reflects the toggle state (✔ glyph — see MenuBar)
  await page.getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByRole('menuitem', { name: /spectrum panel/i })).toContainText('✔');
});

/** e2e flow #6b — BPM detection runs and reports via toast. */
test('flow #6b: BPM detection reports a result', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Analyze' }).click();
  await page.getByRole('menuitem', { name: /tempo/i }).click();
  // toasts stack — a new one beyond 'Loaded demo.wav' proves the run completed
  await expect(page.locator('.toast-msg').nth(1)).toBeVisible({ timeout: 15_000 });
});

/** e2e flow #6c — MP3 export embeds the ID3v2.4 tag set via Song Info. */
test('flow #6c: MP3 export embeds song info as ID3', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /export/i }).click();
  const panel = page.getByRole('dialog');
  await panel.locator('#export-format').selectOption('mp3');

  await panel.getByRole('button', { name: /song info/i }).click();
  const meta = page.getByRole('dialog', { name: /song info/i });
  await meta.locator('#meta-title').fill('E2E Title');
  await meta.locator('#meta-artist').fill('WaveForge');
  await meta.getByRole('button', { name: /save/i }).click();

  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: /export/i }).click();
  const file = await downloadPromise;
  const bytes = (await import('node:fs')).readFileSync(await file.path());
  expect(bytes.subarray(0, 3).toString('ascii')).toBe('ID3');
  // v2.4, no footer
  expect(bytes[3]).toBe(0x04);
  expect((bytes[5] ?? 0xff) & 0x80).toBe(0); // syncsafe flag byte: footer bit clear
  expect(bytes.length).toBeGreaterThan(50_000);
});
