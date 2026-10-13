import { expect, test, type Page } from '@playwright/test';

/**
 * PF-01 / AM-07 — markers: add (M, named via prompt), jump ([ / ]),
 * rename + delete via the Edit ▸ Markers menu, and draft persistence
 * (markers ride the draft payload). Kernel edges are unit-covered;
 * here we prove the user-visible flows.
 */

async function loadSample(page: Page): Promise<void> {
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

const zeroReadout = (page: Page) => page.locator('.status-item', { hasText: '0.000 s' });

test('markers: add named (M), accept default, jump (]), rename, delete', async ({ page }) => {
  await loadSample(page);

  // marker 1 at the cursor (0 s), named via the prompt
  await page.keyboard.press('b');
  const dialog = page.getByRole('dialog', { name: /add marker/i });
  await expect(dialog).toBeVisible();
  await dialog.locator('#text-prompt-value').fill('chorus');
  await dialog.getByRole('button', { name: /apply/i }).click();
  await expect(page.locator('.toast-msg').last()).toContainText('Marker "chorus" added', {
    timeout: 15_000,
  });

  // marker 2 via canvas double-click at ~mid-wave (AM-07 parity)
  const box = await page.locator('canvas.wave-canvas').boundingBox();
  await page.locator('canvas.wave-canvas').dblclick({
    position: { x: Math.round(box!.width * 0.5), y: 60 },
  });
  const dialog2 = page.getByRole('dialog', { name: /add marker/i });
  await expect(dialog2.locator('#text-prompt-value')).toHaveValue('Marker 1');
  await dialog2.getByRole('button', { name: /apply/i }).click();
  await expect(page.locator('.toast-msg').last()).toContainText('Marker "Marker 1" added', {
    timeout: 15_000,
  });

  // jump: Home → 0.000 s shown; ] → cursor at the ~4 s marker
  await page.keyboard.press('Home');
  await expect(zeroReadout(page)).toHaveCount(1);
  await page.keyboard.press(']');
  await expect(zeroReadout(page)).toHaveCount(0);

  // rename the nearest marker (the one we jumped to) via the menu
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename Marker' }).click();
  const renameDialog = page.getByRole('dialog', { name: /rename marker/i });
  await expect(renameDialog.locator('#text-prompt-value')).toHaveValue('Marker 1');
  await renameDialog.locator('#text-prompt-value').fill('bridge');
  await renameDialog.getByRole('button', { name: /apply/i }).click();
  await expect(page.locator('.toast-msg').last()).toContainText('renamed to "bridge"', {
    timeout: 15_000,
  });

  // delete the nearest marker via the menu
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete Marker' }).click();
  await expect(page.locator('.toast-msg').last()).toContainText('Marker "bridge" deleted', {
    timeout: 15_000,
  });

  // [ jumps back to the remaining "chorus" marker at 0 s
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('[');
  await expect(zeroReadout(page)).toHaveCount(1);
});

test('markers persist through a draft save/open round-trip', async ({ page }) => {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).showSaveFilePicker;
  });
  await loadSample(page);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight'); // cursor ≈ 2 s
  await page.keyboard.press('b');
  const dialog = page.getByRole('dialog', { name: /add marker/i });
  await dialog.locator('#text-prompt-value').fill('persist-me');
  await dialog.getByRole('button', { name: /apply/i }).click();
  await expect(page.locator('.toast-msg').last()).toContainText('Marker "persist-me" added', {
    timeout: 15_000,
  });

  // save under a known name
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /save draft/i }).click();
  const saveDialog = page.getByRole('dialog', { name: /save draft/i });
  await saveDialog.locator('#draft-name').fill('e2e markers');
  await saveDialog.getByRole('button', { name: /save draft/i }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Draft saved/i, {
    timeout: 10_000,
  });

  // reload → reopen the draft
  await page.reload();
  await expect(page.getByRole('dialog', { name: /welcome/i })).toBeVisible();
  await page.mouse.click(4, 400);
  await expect(page.getByRole('dialog', { name: /welcome/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /drafts/i }).click();
  const manager = page.getByTestId('drafts-dialog');
  await expect(manager.getByTestId('draft-e2e markers')).toBeVisible();
  await manager.getByTestId('draft-e2e markers').click();

  // document restored — jump to the surviving ~2 s marker
  await page.keyboard.press('Home');
  await expect(zeroReadout(page)).toHaveCount(1);
  await page.keyboard.press(']');
  await expect(zeroReadout(page)).toHaveCount(0); // marker survived the round-trip
});
