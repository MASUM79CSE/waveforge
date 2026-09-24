import { expect, test } from '@playwright/test';

/**
 * e2e flow #5 (plan §7.3) — draft persistence: save draft → reload page →
 * reopen draft → document restored with identical identity. PCM-byte hash
 * equality is asserted in tests/integration/draft-roundtrip.test.ts; here
 * we verify the user-visible round-trip through real IndexedDB.
 */

async function loadSample(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

test('flow #5: save draft → reload → reopen → same document', async ({ page }) => {
  await loadSample(page);

  // save under a known name
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /save draft/i }).click();
  const saveDialog = page.getByRole('dialog', { name: /save draft/i });
  await saveDialog.locator('#draft-name').fill('e2e draft');
  await saveDialog.getByRole('button', { name: /save draft/i }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Draft saved/i, {
    timeout: 10_000,
  });

  // reload the page — IndexedDB persists across it
  await page.reload();
  await expect(page.getByRole('dialog', { name: /welcome/i })).toBeVisible();
  // dismiss the welcome modal (backdrop click) — the draft lives in IDB
  await page.mouse.click(4, 400);
  await expect(page.getByRole('dialog', { name: /welcome/i })).toHaveCount(0);

  // reopen the drafts manager and open the saved draft
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /drafts/i }).click();
  const manager = page.getByTestId('drafts-dialog');
  await expect(manager.getByTestId('draft-e2e draft')).toBeVisible();
  await manager.getByTestId('draft-e2e draft').getByRole('button', { name: 'Open' }).click();

  // same document back: status bar shows the draft's name and duration
  await expect(page.getByText('e2e draft', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
});

test('flow #5c: the NR noise print survives a draft save / reload / reopen', async ({ page }) => {
  await loadSample(page);

  // select a region and learn a print from it (Effects → Noise Reduction)
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not laid out');
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();

  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Noise Reduction/ }).click();
  const nr = page.getByRole('dialog');
  await expect(nr).toBeVisible();
  await nr.getByRole('button', { name: /learn print from selection/i }).click();
  await expect(nr.getByText(/print learned/i)).toBeVisible({ timeout: 15_000 });
  await nr.getByRole('button', { name: 'Cancel' }).click();

  // save → reload → reopen (same choreography as flow #5)
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /save draft/i }).click();
  const saveDialog = page.getByRole('dialog', { name: /save draft/i });
  await saveDialog.locator('#draft-name').fill('e2e print draft');
  await saveDialog.getByRole('button', { name: /save draft/i }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Draft saved/i, {
    timeout: 10_000,
  });

  await page.reload();
  await expect(page.getByRole('dialog', { name: /welcome/i })).toBeVisible();
  await page.mouse.click(4, 400);
  await expect(page.getByRole('dialog', { name: /welcome/i })).toHaveCount(0);

  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /drafts/i }).click();
  const manager = page.getByTestId('drafts-dialog');
  await expect(manager.getByTestId('draft-e2e print draft')).toBeVisible();
  await manager.getByTestId('draft-e2e print draft').getByRole('button', { name: 'Open' }).click();
  await expect(page.getByText('e2e print draft', { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  // the print came back with the document
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Noise Reduction/ }).click();
  const nr2 = page.getByRole('dialog');
  await expect(nr2).toBeVisible();
  await expect(nr2.getByText(/print restored from draft/i)).toBeVisible({ timeout: 15_000 });
});

test('flow #5b: autosave ring offers crash recovery after a burst of edits', async ({ page }) => {
  await loadSample(page);

  // 8 committed edits (AUTOSAVE_OPS) trigger a ring write after 1 s
  for (let i = 0; i < 8; ++i) {
    await page.getByRole('button', { name: 'Effects', exact: true }).click();
    await page.getByRole('menuitem', { name: /invert/i }).click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1500); // micro-debounce window

  // "crash": reload without touching anything → restore banner appears;
  // dismiss the welcome modal first so the banner is clickable
  await page.reload();
  await expect(page.getByRole('dialog', { name: /welcome/i })).toBeVisible();
  await page.mouse.click(4, 400);
  const banner = page.getByTestId('restore-banner');
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await banner.getByRole('button', { name: /restore/i }).click();

  // the edited session is back (9.27 s demo, banner gone)
  await expect(page.getByTestId('restore-banner')).toHaveCount(0);
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
});
