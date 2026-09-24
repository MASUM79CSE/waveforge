import { expect, test, type Page } from '@playwright/test';

/**
 * 37th e2e (A5 — docs/automation-plan.md): draw a volume envelope on the
 * imported lane (A mode → two click-points), play through the ramped legs,
 * save the draft and reload — the curve rides v3 and is intact after the
 * round-trip (mixdown bit-identity is unit-anchored; here it's the UI path).
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

test('automation: draw envelope, play, save/reload draft — curve intact (A5)', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await loadSample(page);

  // project + 3 s take lane
  await page.getByRole('button', { name: 'Add track', exact: true }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import audio/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'vox.wav', mimeType: 'audio/wav', buffer: wavBytes(3) });
  const lane = page.locator('.lane', { hasText: 'vox' });
  await lane.click();
  await expect(page.getByTestId('clips-vox')).toHaveText('1');
  await expect(page.getByTestId('automation-vox')).toHaveText('0');

  // A toggles envelope mode; the lane picks up the param picker
  await page.keyboard.press('a');
  await expect(lane.getByRole('button', { name: /vox automation parameter volume/i })).toBeVisible();

  // draw two points on the lane canvas (down-fade then lift)
  const laneCanvas = lane.locator('canvas.lane-canvas');
  const box = await laneCanvas.boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height * 0.75);
  await page.mouse.click(box!.x + box!.width * 0.75, box!.y + box!.height * 0.3);
  await expect(page.getByTestId('automation-vox')).toHaveText('2');

  // playback runs through the ramped legs
  await page.getByRole('button', { name: /^Play \(Space\)/ }).click();
  await expect(page.getByRole('button', { name: /^Pause \(Space\)/ })).toBeVisible();
  await page.getByRole('button', { name: /^Pause \(Space\)/ }).click();

  // save draft → reload → reopen
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /save draft/i }).click();
  const saveDialog = page.getByRole('dialog', { name: /save draft/i });
  await saveDialog.locator('#draft-name').fill('envelope e2e');
  await saveDialog.getByRole('button', { name: /save draft/i }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Draft saved/i, {
    timeout: 10_000,
  });

  await page.reload();
  await page.mouse.click(4, 400);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /drafts/i }).click();
  const manager = page.getByTestId('drafts-dialog');
  await manager.getByTestId('draft-envelope e2e').getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('.lane', { hasText: 'vox' })).toBeVisible({ timeout: 10_000 });

  // the envelope survived: two volume points on the lane
  await expect(page.getByTestId('automation-vox')).toHaveText('2', { timeout: 10_000 });

  // and it still plays
  await page.getByRole('button', { name: /^Play \(Space\)/ }).click();
  await expect(page.getByRole('button', { name: /^Pause \(Space\)/ })).toBeVisible();
  await page.getByRole('button', { name: /^Pause \(Space\)/ }).click();

  expect(consoleErrors).toEqual([]);
});
