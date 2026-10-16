/**
 * PF-05 / AM-12 — portable `.amss` session save/open through the REAL UI:
 * the Export dialog's session card (project mode only) downloads a real
 * `.amss` file (magic checked from the download bytes); after mutating
 * the project, File ▸ Open File… reloads it through the file-chooser and
 * the restored project is proven behaviorally: lane count back, marker
 * jump lands on the saved position, and the mixdown is byte-identical to
 * the pre-save export (full PCM + arrangement round-trip).
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

async function loadSample(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

async function exportMixdown(page: Page, path: string): Promise<Buffer> {
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /export/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: /Export mixdown/i }).click();
  const file = await download;
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await page.waitForTimeout(200);
  const bytes = readFileSync(await file.path());
  writeFileSync(path, bytes);
  return bytes;
}

test('session save/open round-trips the project (AM-12)', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Add track', exact: true }).click(); // project mode
  await expect(page.locator('.lane')).toHaveCount(2);

  // cursor at ~25% of the view, marker there (B), then read the position
  const wave = page.locator('.wave-canvas').first();
  const box = await wave.boundingBox();
  if (!box) throw new Error('no waveform canvas');
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await page.waitForTimeout(200);
  const cursorBefore = await page
    .locator('.status-item')
    .filter({ hasText: /^\d+\.\d{3} s$/ })
    .last()
    .textContent();
  const at = parseFloat(cursorBefore ?? '0');
  expect(at).toBeGreaterThan(0.5);
  await page.keyboard.press('b'); // opens the add-marker prompt (PF-01)
  const markerPrompt = page.getByRole('dialog', { name: /marker/i });
  await expect(markerPrompt).toBeVisible();
  await markerPrompt.getByRole('button', { name: /apply|add|ok/i }).click();
  await expect(markerPrompt).toBeHidden();
  await page.waitForTimeout(200);

  // baseline mixdown, then save the session via the Export dialog card
  const baseline = await exportMixdown(page, '/tmp/pf05-base.wav');
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /export/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('export-format-amss')).toBeVisible(); // project mode only
  await panel.getByTestId('export-format-amss').click();
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Export', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.amss$/i);
  const amssBytes = readFileSync(await file.path());
  writeFileSync('/tmp/pf05-session.amss', amssBytes);
  expect([...amssBytes.slice(0, 4)]).toEqual([1, 65, 77, 83]); // magic ' AMS'
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.locator('.toast-msg').last()).toHaveText('Saved session');

  // mutate at the PROJECT level: mute lane 1 (mixdown drops to silence;
  // the mute flag round-trips through the session's track flags)
  const lane1Mute = page
    .locator('.lane')
    .first()
    .getByRole('button', { name: /mute/i });
  await lane1Mute.click();
  await expect(lane1Mute).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300);
  const mutated = await exportMixdown(page, '/tmp/pf05-mutated.wav');
  expect(mutated.equals(baseline)).toBe(false);

  // reopen the session through the real file-open path
  await page.getByRole('menuitem', { name: 'File' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: /open file/i }).click();
  (await chooser).setFiles('/tmp/pf05-session.amss');
  await expect(page.locator('.toast-msg').last()).toHaveText(/Loaded session: .*\.amss/);
  await expect(page.locator('.lane')).toHaveCount(2);

  // the marker survived: ] jumps to its saved position
  await page.keyboard.press(']');
  const want = `${at.toFixed(3)} s`;
  await expect(
    page
      .locator('.status-item')
      .filter({ hasText: /^\d+\.\d{3} s$/ })
      .last(),
  ).toHaveText(want, { timeout: 5_000 });

  // and the mixdown is byte-identical to the pre-save export
  const restored = await exportMixdown(page, '/tmp/pf05-restored.wav');
  expect(restored.equals(baseline)).toBe(true);
});

test('a corrupt .amss file is refused with the reference toast', async ({ page }) => {
  writeFileSync('/tmp/pf05-bogus.amss', Buffer.from('definitely not a session file'));
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await expect(welcome).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await welcome.getByRole('button', { name: /open file/i }).click();
  (await chooser).setFiles('/tmp/pf05-bogus.amss');
  await expect(page.locator('.toast-msg').last()).toHaveText('Could not load session');
  // no document was installed — the workspace is still empty
  await expect(page.getByText('demo.wav', { exact: true })).toHaveCount(0);
});
