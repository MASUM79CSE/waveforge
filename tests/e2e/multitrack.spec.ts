import { expect, test, type Page } from '@playwright/test';

/**
 * M8d multitrack e2e: lane stack opens from the transport ＋ button,
 * imports land as new lanes, strips mix (solo), project playback runs,
 * and remove-track is undoable through the project history.
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

/** Minimal valid mono WAV (16-bit PCM 44.1 kHz, ~0.1 s of a square hum). */
function wavBytes(): Buffer {
  const sr = 44100;
  const n = 4410;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; ++i) {
    data.writeInt16LE(((i % 100) < 50 ? 6000 : -6000) | 0, i * 2);
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

test('multitrack: add lanes, solo, play, remove + undo (M8d)', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await loadSample(page);

  // ＋ opens the project: the doc becomes lane 1, an import lane appears
  await page.getByRole('button', { name: 'Add track', exact: true }).click();
  const stack = page.getByRole('list', { name: /add track/i });
  await expect(stack).toBeVisible();
  await expect(page.locator('.lane').first()).toContainText('demo.wav');

  // import → second lane renders with the file name
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import audio/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'take2.wav', mimeType: 'audio/wav', buffer: wavBytes() });
  await expect(page.locator('.lane')).toHaveCount(3); // lane1 + take2 + import lane
  await expect(page.locator('.lane', { hasText: 'take2' })).toBeVisible();
  await expect(page.locator('.lane').first().locator('canvas.lane-canvas')).toBeVisible();

  // click lane 2 → active framing
  await page.locator('.lane', { hasText: 'take2' }).click();
  await expect(page.locator('.lane.active', { hasText: 'take2' })).toBeVisible();

  // solo lane 2 (strip S button)
  const soloBtn = page.getByRole('button', { name: 'take2 solo track' });
  await soloBtn.click();
  await expect(soloBtn).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // project playback runs (transport switches to Pause, then back)
  await page.getByRole('button', { name: /^Play \(Space\)/ }).click();
  await expect(page.getByRole('button', { name: /^Pause \(Space\)/ })).toBeVisible();
  await page.getByRole('button', { name: /^Pause \(Space\)/ }).click();
  await expect(page.getByRole('button', { name: /^Play \(Space\)/ })).toBeVisible();

  // remove lane 2 (× then ✓) → undo brings it back with data
  await page.getByRole('button', { name: 'take2 remove track' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.lane', { hasText: 'take2' })).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.lane', { hasText: 'take2' })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
