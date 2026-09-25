import { expect, test } from '@playwright/test';

/**
 * 49th e2e (P4 — docs/analyze-plan.md addendum): the analysis report is
 * deliverable — Export CSV downloads a well-formed file (header, verdict
 * rows), Copy report lands the text summary on the clipboard with a
 * confirmation toast. Zero console errors.
 */

/** PCM16 wav: 1 s of 440 Hz sine at ~−12 dBFS with two LONG clipped runs. */
function clippedWav(): Buffer {
  const sr = 44100;
  const n = sr;
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
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sr, 24);
  header.writeUInt32LE(sr * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test('report export: CSV download + clipboard copy (P4)', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  const chooserPromise = page.waitForEvent('filechooser');
  await welcome.getByRole('button', { name: /open/i }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'clipped.wav', mimeType: 'audio/wav', buffer: clippedWav() });
  await expect(page.getByText('clipped.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  // run the full report
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await page.getByRole('menuitem', { name: /Full report/i }).click();
  const report = page.getByTestId('analysis-report');
  await expect(report).toBeVisible({ timeout: 20_000 });

  // Export CSV → a real download with the expected machine-readable shape
  const downloadPromise = page.waitForEvent('download');
  await report.getByTestId('report-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('analysis-report.csv');
  const path = await download.path();
  const fs = await import('node:fs');
  const csv = fs.readFileSync(path!, 'utf8');
  expect(csv.startsWith('section,metric,value,unit')).toBe(true);
  expect(csv).toContain('verdict,spotify');
  expect(csv).toContain('tp_safe');

  // Copy report → confirmation toast + clipboard carries the summary
  await report.getByTestId('report-copy').click();
  await expect(page.locator('.toast-msg').last()).toContainText(/copied/i, { timeout: 8000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('WaveForge analysis report');
  expect(clip).toContain('Spotify');

  expect(consoleErrors).toEqual([]);
});
