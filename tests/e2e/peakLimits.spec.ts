import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * AM-08: View ▸ Peak separators — full-scale (0 dBFS) limit lines drawn on
 * the waveform, reference parity (wavesurfer params.limits). Pixel-probe
 * proof: toggling the item changes the canvas; the check glyph tracks the
 * state; the choice persists across a reload.
 */

async function loadSample(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

async function canvasShot(page: Page): Promise<string> {
  return page.locator('canvas.wave-canvas').evaluate((el) => (el as HTMLCanvasElement).toDataURL());
}

test('peak separators: toggle draws limit lines, check glyph tracks, persists', async ({ page }) => {
  await loadSample(page);
  await page.waitForTimeout(300);

  const before = await canvasShot(page);

  await page.getByRole('button', { name: 'View' }).click();
  await page.getByRole('menuitem', { name: /peak separators/i }).click();
  await page.waitForTimeout(300);

  // the canvas changed: limit lines appeared
  const after = await canvasShot(page);
  expect(after).not.toBe(before);

  // the menu item now shows the check glyph
  await page.getByRole('button', { name: 'View' }).click();
  await expect(page.getByRole('menuitem', { name: /peak separators/i })).toContainText('✔');
  await page.keyboard.press('Escape');

  // persists across a reload (the sample is reloaded deterministically)
  await page.reload();
  const welcome2 = page.getByRole('dialog', { name: /welcome/i });
  await expect(welcome2).toBeVisible({ timeout: 10_000 });
  await welcome2.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(300);
  const persisted = await canvasShot(page);
  expect(persisted).toBe(after);

  // and toggling off restores the original frame
  await page.getByRole('button', { name: 'View' }).click();
  await page.getByRole('menuitem', { name: /peak separators/i }).click();
  await page.waitForTimeout(300);
  expect(await canvasShot(page)).toBe(before);
});
