import { expect, test, type Page } from '@playwright/test';

/**
 * H-sweep for the Phase-6 surface: seek-pair rapid/double-fire + disabled
 * races, the 430 px tuck boundary under resize, bn labels for the new
 * controls, restored menu hints (no phantom "Tab"), panel check-state
 * round-trip.
 */

async function loadV2(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/?cbv2=1');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  // demo.wav loads under either locale (bn quickSample = নমুনা লোড করুন)
  await welcome
    .getByRole('button', { name: /load sample|নমুনা লোড/i })
    .click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

test('single seek click = exact +5 s; second click clamps at document end', async ({
  page,
}) => {
  await loadV2(page, 1280);
  const fwd = page.getByTestId('transport-seek-fwd');
  await fwd.click();
  await expect(page.getByTestId('cb2-clock')).toHaveText(/0:05\.000/);
  await fwd.click(); // 10 s > 9.272 s document → clamped, exactly at the end
  await expect(page.getByTestId('cb2-clock')).toHaveText(/0:09\.272/);
});

test('keyboard Enter on seek is single-fire (1 Enter = +5 s exactly)', async ({ page }) => {
  await loadV2(page, 1280);
  const fwd = page.getByTestId('transport-seek-fwd');
  await fwd.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cb2-clock')).toHaveText(/0:05\.000/);
  // rapid Enters settle clamped and stable (no crash, no runaway)
  for (let i = 0; i < 6; i++) await page.keyboard.press('Enter');
  await expect(page.getByTestId('cb2-clock')).toHaveText(/0:09\.272/);
});

test('no document: seek pair is disabled and stays harmless under forced events', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?cbv2=1');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await page.mouse.click(4, 400); // dismiss without loading
  await expect(welcome).toHaveCount(0);
  const back = page.getByTestId('transport-seek-back');
  await expect(back).toBeDisabled();
  await back.click({ force: true, trial: true }).catch(() => {});
  await expect(page.getByTestId('cb2-clock')).toHaveText(/0:00\.000/);
});

test('430 px tuck boundary: resize across it keeps exactly one instance, reachable', async ({
  page,
}) => {
  await loadV2(page, 500);
  const inRow = page.locator('.cb2-row [data-testid="transport-seek-back"]');
  await expect(inRow).toBeVisible(); // inline ≥430
  await page.setViewportSize({ width: 429, height: 900 });
  await expect(inRow).toHaveCount(0); // tucked out of the row
  await page.getByTestId('cb2-overflow').click();
  const total = await page.evaluate(
    () => document.querySelectorAll('[data-testid="transport-seek-back"]').length,
  );
  expect(total).toBe(1); // exactly one, inside the panel
  await expect(page.getByTestId('transport-seek-back')).toBeVisible();
  await page.setViewportSize({ width: 500, height: 900 });
  await expect(page.locator('.cb2-row [data-testid="transport-seek-back"]')).toBeVisible();
});

test('bn: seek pair labels render inline and in the panel', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('waveforge.locale', 'bn');
  });
  await loadV2(page, 1280);
  await expect(page.getByRole('button', { name: '৫ সেকেন্ড পেছনে' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByTestId('cb2-overflow').click();
  await expect(page.getByRole('button', { name: '৫ সেকেন্ড সামনে' })).toBeVisible();
});

test('restored hints show in menus; the phantom "Tab" stays gone', async ({ page }) => {
  await loadV2(page, 2300);
  const edit = page.getByRole('menubar').getByRole('menuitem', { name: 'Edit' });
  await edit.click();
  const editMenu = page.locator('[role="menu"][data-menu="edit"]');
  await expect(editMenu).toBeVisible();
  await expect(editMenu).toContainText('Ctrl+Z'); // platform-truth hint
  await page.keyboard.press('Escape');
  const view = page.getByRole('menubar').getByRole('menuitem', { name: 'View' });
  await view.click();
  const viewMenu = page.locator('[role="menu"][data-menu="view"]');
  await expect(viewMenu).toBeVisible();
  expect(await viewMenu.textContent()).not.toContain('Tab'); // purged hint stays purged
  await page.keyboard.press('Escape');
  // R/P/M live in the Record group of the File menu
  const file = page.getByRole('menubar').getByRole('menuitem', { name: 'File' });
  await file.click();
  const fileMenu = page.locator('[role="menu"][data-menu="file"]');
  await expect(fileMenu).toBeVisible();
  const recordGroup = fileMenu.locator('.menu-item', { hasText: 'Record' }).first();
  await expect(recordGroup).toBeVisible();
});

test('monitor check-state round-trips through the panel menu', async ({ page }) => {
  await loadV2(page, 1280);
  await page.getByTestId('cb2-overflow').click();
  await page.getByTestId('cb2-overflow-record-monitor').click(); // ON, closes
  await page.getByTestId('cb2-overflow').click();
  await expect(page.getByTestId('cb2-overflow-record-monitor')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByTestId('cb2-overflow-record-monitor').click(); // OFF, closes
  await page.getByTestId('cb2-overflow').click();
  await expect(page.getByTestId('cb2-overflow-record-monitor')).toHaveAttribute(
    'aria-checked',
    'false',
  );
});
