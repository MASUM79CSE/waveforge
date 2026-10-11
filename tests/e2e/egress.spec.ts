import { expect, test } from '@playwright/test';
import { attachEgressGuard } from './helpers/egress';

/**
 * P1.7 — the privacy proof: a full user journey makes ZERO requests
 * outside the app origin (no consent given ⇒ no model downloads either).
 * Invariant 1 from the master prompt, enforced structurally.
 */
test('egress: load → edit → export makes no outbound requests', async ({ page }) => {
  const egress = attachEgressGuard(page);
  await page.goto('/?rag=1');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.waitFor({ timeout: 10_000 });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await page.getByText('demo.wav', { exact: true }).waitFor({ timeout: 10_000 });

  // edit: select the first half and cut
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('Control+x');
  await page.waitForTimeout(300);

  // export WAV (download path)
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /export/i }).click();
  await page.getByTestId('export-format-wav').click();
  const panel = page.getByRole('dialog');
  const download = page.waitForEvent('download', { timeout: 15_000 });
  await panel.getByRole('button', { name: /export/i }).click();
  await download;

  expect(egress.violations()).toEqual([]);
  // no request body ever carried data outbound
  expect(egress.requests().filter((u) => !u.startsWith('http://localhost'))).toEqual([]);
});

/**
 * Guard self-test: a deliberate outbound fetch IS caught. This keeps the
 * guard honest without ever leaving a violation in the product.
 */
test('egress guard catches a deliberate example.com fetch', async ({ page }) => {
  const egress = attachEgressGuard(page);
  await page.goto('/');
  await page.getByRole('dialog', { name: /welcome/i }).waitFor({ timeout: 10_000 });
  await page.evaluate(() => {
    void fetch('https://example.com/ping').catch(() => {});
  });
  await page.waitForTimeout(1_500);
  expect(egress.violations().some((u) => u.includes('example.com'))).toBe(true);
});
