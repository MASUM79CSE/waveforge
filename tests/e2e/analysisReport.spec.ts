import { expect, test, type Page } from '@playwright/test';

/**
 * 48th e2e (P3 — docs/analyze-plan.md): import a generated wav containing
 * clipped runs, run the full professional report, assert the delivery
 * metrics render (integrated LUFS, verdict table, clipping audit), then
 * jump-to-offender selects the first clipped run. Zero console errors.
 */

/** PCM16 wav bytes: 1 s of 440 Hz sine at ~−12 dBFS with 2 LONG clipped
 * runs (240-sample flat ±full-scale — their interior survives any
 * resampling bit-exactly, unlike short runs). */
function clippedWav(): Buffer {
  const sr = 44100;
  const n = sr; // 1 s
  const data = Buffer.alloc(n * 2);
  const amp = Math.pow(10, -12 / 20);
  for (let i = 0; i < n; ++i) {
    let v = amp * Math.sin((2 * Math.PI * 440 * i) / sr);
    if ((i >= 10000 && i < 10240) || (i >= 30000 && i < 30240)) v = v >= 0 ? 1 : -1;
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sr, 24);
  header.writeUInt32LE(sr * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function importWav(page: Page, buffer: Buffer): Promise<void> {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  const chooserPromise = page.waitForEvent('filechooser');
  await welcome.getByRole('button', { name: /open/i }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'clipped.wav', mimeType: 'audio/wav', buffer });
  await expect(page.getByText('clipped.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

test('full analysis report: metrics, verdicts, jump-to-offender (P3)', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await importWav(page, clippedWav());

  // Analyze → Full report (opens the panel and runs the scan)
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await page.getByRole('menuitem', { name: /Full report/i }).click();

  const report = page.getByTestId('analysis-report');
  await expect(report).toBeVisible({ timeout: 20_000 });

  // loudness row renders a formatted LUFS value
  await expect(report).toContainText(/LUFS/);
  // verdict table: platform chips with gain + TP flag
  await expect(report.getByTestId('report-verdicts')).toContainText(/Spotify/);
  await expect(report.getByTestId('report-verdicts')).toContainText(/EBU R128/);
  await expect(report.getByTestId('report-verdicts')).toContainText(/Netflix/);

  // integrity audit: both runs detected (the long flat runs survive the
  // decode/resample path with ≥3 consecutive clipped samples)
  await expect(report).toContainText(/[1-9]\d* \([2-9] runs\)/);
  await report.getByRole('button', { name: /Select first clipped run/i }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/selected/i, { timeout: 8000 });

  expect(consoleErrors).toEqual([]);
});
