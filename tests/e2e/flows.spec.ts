import { expect, test } from '@playwright/test';

/**
 * e2e flow #1 — load sample, render waveform, play, edit, undo.
 * (Flow #1 was deferred from M1 to M4 when the Playwright suite landed.)
 */
test('flow #1: load sample → play → select → cut → undo', async ({ page }) => {
  await page.goto('/');
  // welcome dialog → load the generated sample (scoped: the workspace has
  // its own empty-state "Load sample" button)
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  // canvas rendered with content
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();

  // play moves the cursor
  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  await page.keyboard.press('Space');
  // status bar cursor format: "0.123 s"
  await expect(page.locator('.status-item', { hasText: /\d+\.\d{3} s/ }).first()).toBeVisible();

  // select the first third of the canvas, cut it, then undo
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not laid out');
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: /cut/i }).click();
  await page.waitForTimeout(300);

  await page.keyboard.press('Shift+z'); // undo
  await page.waitForTimeout(300);
  await expect(page.getByText(/undid/i).first()).toBeVisible();
});

/**
 * e2e flow #3 — record with Chromium's fake media device: a tone plays
 * into the mic; recording produces a loaded document.
 */
test('flow #3: record a take with the fake microphone', async ({ page }) => {
  await page.goto('/');
  // dismiss welcome (recording installs its own document)
  await page.getByRole('button', { name: /skip|close|✕/i }).first().click().catch(() => {});
  await page.getByRole('button', { name: /record/i }).first().click();
  await page.waitForTimeout(2500); // record ~2.5 s
  await page.getByRole('button', { name: /stop recording/i }).click();

  // the take installs as the active document
  await expect(page.getByText(/recording 1/i).first()).toBeVisible({ timeout: 10_000 });
});
