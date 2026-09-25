import { expect, test } from '@playwright/test';

async function loadSample(page: import('@playwright/test').Page): Promise<void> {
  // headless Chromium cannot interact with the native save picker — force
  // the <a download> fallback the app uses when the API is unavailable
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
 * e2e flow #4 — export the sample through each encoder and assert the
 * downloaded bytes' container structure. This is also the FLAC validation
 * gate (the vendored wasm encoder only runs in a browser worker).
 */
for (const [format] of [['wav']] as const) {
  test(`flow #4: export ${format.toUpperCase()} is a valid RIFF file`, async ({ page }) => {
    await loadSample(page);
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /export/i }).click();
    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await panel.getByRole('button', { name: /export/i }).click();
    const file = await downloadPromise;
    expect(file.suggestedFilename()).toMatch(/\.wav$/i);

    const path = await file.path();
    const bytes = (await import('node:fs')).readFileSync(path);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WAVE');
    // 9.27 s stereo 16-bit ≈ 1.6 MB
    expect(bytes.length).toBeGreaterThan(1_000_000);
  });
}

test('flow #4: export MP3 produces frame-synced MPEG audio', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /export/i }).click();
  const panel = page.getByRole('dialog');
  await panel.getByTestId('export-format-mp3').click();
  await panel.locator('#export-quality').selectOption('192');

  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: /export/i }).click();
  const file = await downloadPromise;
  expect(file.suggestedFilename()).toMatch(/\.mp3$/i);

  const bytes = (await import('node:fs')).readFileSync(await file.path());
  // MPEG frame sync (0xFFEx) or ID3 header
  const sync = bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0;
  const id3 = bytes.subarray(0, 3).toString('ascii') === 'ID3';
  expect(sync || id3).toBe(true);
  expect(bytes.length).toBeGreaterThan(50_000); // ~9 s @ 192 kbps ≈ 220 KB
});

test('flow #4: export FLAC runs the vendored wasm encoder (fLaC magic)', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /export/i }).click();
  const panel = page.getByRole('dialog');
  await panel.getByTestId('export-format-flac').click();
  await panel.locator('#export-quality').selectOption('5');

  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: /export/i }).click();
  const file = await downloadPromise;
  expect(file.suggestedFilename()).toMatch(/\.flac$/i);

  const bytes = (await import('node:fs')).readFileSync(await file.path());
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('fLaC');
  expect(bytes.length).toBeGreaterThan(100_000);
});
