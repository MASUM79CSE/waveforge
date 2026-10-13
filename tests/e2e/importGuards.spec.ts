import { expect, test, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * WF-009 — import failure recovery (e2e): malformed and empty files must
 * produce a FRIENDLY typed-error toast (never a crash or endless
 * spinner) and leave the currently open document intact.
 */
const E102 = 'Could not decode this file — it may be corrupt or unsupported.';
const E101 = 'This format is not supported by your browser.';

function garbageWav(): Buffer {
  // correct RIFF magic so even container sniffers would try, then junk
  const b = Buffer.alloc(5000, 0x7f);
  b.write('RIFF', 0, 'ascii');
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  return b;
}

async function loadSample(page: Page): Promise<void> {
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

async function pickFile(page: Page, name: string, bytes: Buffer): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'wf-import-guard-'));
  const path = join(dir, name);
  writeFileSync(path, bytes);
  await page.getByRole('button', { name: 'File' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10_000 }),
    page.getByRole('menuitem', { name: 'Open File…' }).click(),
  ]);
  await chooser.setFiles(path);
}

for (const [name, bytes, message] of [
  ['broken.wav', garbageWav(), E102],
  ['empty.wav', Buffer.alloc(0), E101],
] as const) {
  test(`import guard: ${name} shows a friendly typed error and keeps the document`, async ({ page }) => {
    await loadSample(page);
    await pickFile(page, name, bytes);
    await expect(page.getByText(message)).toBeVisible({ timeout: 10_000 });
    // the previously loaded document survives (header + demo name still shown)
    await expect(page.getByText('demo.wav', { exact: true })).toBeVisible();
    // and the loading overlay is gone (spinner never sticks)
    await expect(page.getByText(/loading/i).first()).toBeHidden();
  });
}
