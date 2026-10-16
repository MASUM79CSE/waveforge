import { expect, test, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachEgressGuard } from './helpers/egress';

// Edit-menu label for insert silence (en)
const insertSilenceLabel = 'Insert Silence';

/**
 * WF-011 — the whole app is same-origin only, for every critical path:
 * load (sample + file import), edit, export. No request ever carries a
 * body (audio never leaves the device — no upload path exists).
 */
async function loadSample(page: Page): Promise<void> {
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

test('egress: sample load + edits + WAV export stay same-origin with zero bodies', async ({ page }) => {
  const egress = attachEgressGuard(page);
  // force the <a download> fallback BEFORE navigation (headless has no
  // native save picker — same trick as export.spec)
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).showSaveFilePicker;
  });
  await loadSample(page);

  // a deterministic ADDITIVE edit (insert silence at 0:00) dirties the
  // document without emptying it (delete-all would leave nothing to export)
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: new RegExp(insertSilenceLabel) }).click();
  await page.waitForTimeout(300);

  // export through the WAV worker
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /export/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: /export/i }).click();
  const file = await downloadPromise;
  expect(file.suggestedFilename()).toMatch(/\.wav$/i);

  expect(egress.violations()).toEqual([]);
  expect(egress.bodiesWithContentSize()).toBe(0);
});

test('egress: file import stays same-origin (no upload path exists)', async ({ page }) => {
  const egress = attachEgressGuard(page);
  await page.goto('/');
  const dir = mkdtempSync(join(tmpdir(), 'wf-egress-'));
  const path = join(dir, 'egress-fixture.wav');
  const sr = 8000;
  const dataLen = sr * 2; // 1 s mono pcm16
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataLen, 40);
  writeFileSync(path, buf);
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10_000 }),
    welcome.getByRole('button', { name: /open file/i }).click(),
  ]);
  await chooser.setFiles(path);
  await expect(page.getByText('egress-fixture.wav', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1000); // settle any late beacons
  expect(egress.violations()).toEqual([]);
  expect(egress.bodiesWithContentSize()).toBe(0);
});
