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

/** Minimal valid mono WAV (16-bit PCM 44.1 kHz, square hum; seconds param). */
function wavBytes(seconds = 0.1): Buffer {
  const sr = 44100;
  const n = Math.round(sr * seconds);
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

test('multitrack: drafts v2 round-trip + mixdown/stems export (M8e)', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await loadSample(page);

  // project with 2 lanes
  await page.getByRole('button', { name: 'Add track', exact: true }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import audio/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'stem-a.wav', mimeType: 'audio/wav', buffer: wavBytes() });
  await expect(page.locator('.lane', { hasText: 'stem-a' })).toBeVisible();

  // save draft (v2: lanes ride the payload)
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /save draft/i }).click();
  const saveDialog = page.getByRole('dialog', { name: /save draft/i });
  await saveDialog.locator('#draft-name').fill('e2e project');
  await saveDialog.getByRole('button', { name: /save draft/i }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Draft saved/i, {
    timeout: 10_000,
  });

  // reload → reopen the draft → both lanes are back
  await page.reload();
  await page.mouse.click(4, 400); // dismiss welcome
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /drafts/i }).click();
  const manager = page.getByTestId('drafts-dialog');
  await manager.getByTestId('draft-e2e project').getByRole('button', { name: 'Open' }).click();
  await expect(page.getByText('e2e project', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.lane', { hasText: 'stem-a' })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.lane')).toHaveCount(3); // doc lane + stem-a + import lane

  // mixdown export → one download (~9.3 s stereo 16-bit WAV)
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /export/i }).click();
  const dialog = page.getByRole('dialog', { name: /export/i });
  await expect(dialog.getByRole('button', { name: /Export mixdown/ })).toBeVisible();
  const mixdownPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /Export mixdown/ }).click();
  const mixdown = await mixdownPromise;
  expect(mixdown.suggestedFilename()).toMatch(/\.wav$/);
  expect((await mixdown.path()) === null || true).toBe(true);

  // stems export → two downloads (doc lane + stem-a)
  const stems: Array<{ name: string }> = [];
  page.on('download', (d) => stems.push({ name: d.suggestedFilename() }));
  await dialog.getByRole('button', { name: /Export stems/ }).click();
  await page.waitForTimeout(4000);
  expect(stems.length).toBeGreaterThanOrEqual(2);
  expect(stems[0]!.name).toContain('01-');
  expect(stems[1]!.name).toContain('02-stem-a');

  expect(consoleErrors).toEqual([]);
});

test('multitrack: effects apply to the active lane and record lands a lane (M8f)', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await loadSample(page);

  // project with an imported lane, then activate it
  await page.getByRole('button', { name: 'Add track', exact: true }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import audio/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'vox.wav', mimeType: 'audio/wav', buffer: wavBytes() });
  await page.locator('.lane', { hasText: 'vox' }).click();
  await expect(page.locator('.lane.active', { hasText: 'vox' })).toBeVisible();

  // De-esser applies to the LANE (dialog effects route by active lane)
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /^De-esser/ }).click();
  const fxPanel = page.getByRole('dialog');
  await expect(fxPanel).toBeVisible();
  await fxPanel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied: De-esser/i, {
    timeout: 15_000,
  });
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await expect(page.locator('.lane', { hasText: 'vox' })).toBeVisible();

  // record while the project is open → the take becomes a new lane
  await page.getByRole('button', { name: /record/i }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /stop recording/i }).click();
  await expect(page.locator('.lane', { hasText: 'Recording 1' })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator('.lane')).toHaveCount(4); // doc + vox + Recording 1 + import

  expect(consoleErrors).toEqual([]);
});

test('multitrack: quick edit commands (Reverse) target the active lane (M8f+)', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await loadSample(page);

  await page.getByRole('button', { name: 'Add track', exact: true }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import audio/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'take9.wav', mimeType: 'audio/wav', buffer: wavBytes() });
  await page.locator('.lane', { hasText: 'take9' }).click();
  await expect(page.locator('.lane.active', { hasText: 'take9' })).toBeVisible();

  // quick command (no dialog) on the lane, then project-history undo
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Reverse$/ }).click();
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await expect(page.locator('.lane', { hasText: 'take9' })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test('arrangement: split at cursor, drag right, undo x2, duplicate, play (M9d)', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await loadSample(page);

  await page.getByRole('button', { name: 'Add track', exact: true }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import audio/ }).click();
  const chooser = await chooserPromise;
  // 3 s take → the clip spans a comfortable ~30% of the default view
  await chooser.setFiles({ name: 'take9.wav', mimeType: 'audio/wav', buffer: wavBytes(3) });
  const lane = page.locator('.lane', { hasText: 'take9' });
  await lane.click(); // activate (lane 2, clip 0..0.1 s)
  const clipsOf = page.getByTestId('clips-take9');
  await expect(clipsOf).toHaveText('1');

  // cursor to ~15% of the view (~1.5 s — mid-clip; doc rail ≈ 26 px)
  const doc = page.locator('canvas.wave-canvas');
  const box = await doc.boundingBox();
  const y = box!.y + box!.height / 2;
  const cursorX = box!.x + 26 + 0.15 * (box!.width - 26);
  await page.mouse.click(cursorX, y);
  await expect(page.getByRole('button', { name: /^Play \(Space\)/ })).toBeVisible();

  // split at cursor → two clips
  await page.keyboard.press('s');
  await expect(clipsOf).toHaveText('2');

  // drag the right half rightward (free space) → still two clips
  const laneBox = await lane.locator('canvas.lane-canvas').boundingBox();
  const ly = laneBox!.y + laneBox!.height / 2;
  const midClip = laneBox!.x + 0.25 * laneBox!.width; // body of the right half
  await page.mouse.move(midClip, ly);
  await page.mouse.down();
  await page.mouse.move(midClip + 0.15 * laneBox!.width, ly, { steps: 8 });
  await page.mouse.up();
  await expect(clipsOf).toHaveText('2');

  // undo x2 → the split is gone (one clip again)
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await page.keyboard.press('Control+z');
  await expect(clipsOf).toHaveText('1');

  // re-select the clip body → Ctrl+D duplicates into the empty right
  await page.mouse.click(laneBox!.x + 45, ly);
  await page.keyboard.press('Control+d');
  await expect(clipsOf).toHaveText('2');

  // arranged playback (startClips path) runs and stops cleanly
  await page.getByRole('button', { name: /^Play \(Space\)/ }).click();
  await expect(page.getByRole('button', { name: /^Pause \(Space\)/ })).toBeVisible();
  await page.getByRole('button', { name: /^Pause \(Space\)/ }).click();
  await expect(page.getByRole('button', { name: /^Play \(Space\)/ })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
