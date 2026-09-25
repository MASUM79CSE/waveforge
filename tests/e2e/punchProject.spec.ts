import { expect, test } from '@playwright/test';

/**
 * e2e #53 — R6: punch in PROJECT mode. The pre-roll rides the project
 * transport (mix playback) and the splice commits through the project
 * history on the ACTIVE LANE (one undo entry) — docs/recording-plan.md.
 */

function wavBytes(seconds = 1): Buffer {
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

test('punch replaces the active lane in a project — one undo step', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  // project with an imported lane, then activate it
  await page.getByRole('button', { name: 'Add track', exact: true }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import audio/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'vox.wav', mimeType: 'audio/wav', buffer: wavBytes(1) });
  await page.locator('.lane', { hasText: 'vox' }).click();
  await expect(page.locator('.lane.active', { hasText: 'vox' })).toBeVisible();

  // configure a 2 s pre-roll (persisted studio setting)
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /record from microphone/i }).click();
  await page.getByTestId('punch-preroll').selectOption('2');
  await page.getByRole('button', { name: /save & close/i }).click();

  // select the timeline, monitoring on, punch
  await page.keyboard.press('Control+a');
  await page.getByTestId('monitor-toggle').click();
  await expect(page.getByText(/input monitoring on/i)).toBeVisible();
  await page.getByTestId('punch-button').click();

  await expect(page.getByText(/punch recorded/i)).toBeVisible({ timeout: 20_000 });

  // ONE project-history entry: undo restores the lane, redo re-applies
  await page.keyboard.press('Control+z');
  await expect(page.getByText(/undid/i).first()).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('.lane', { hasText: 'vox' })).toBeVisible();
  await page.keyboard.press('Control+y');
  await expect(page.getByText(/redid|punch/i).first()).toBeVisible({ timeout: 8_000 });

  // pre-roll setting persisted
  await page.reload();
  await page.getByRole('button', { name: /skip|close|✕/i }).first().click().catch(() => {});
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /record from microphone/i }).click();
  await expect(page.getByTestId('punch-preroll')).toHaveValue('2');

  expect(consoleErrors).toEqual([]);
});
