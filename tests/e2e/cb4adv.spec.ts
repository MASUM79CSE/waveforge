import { expect, test, type Page } from '@playwright/test';

/**
 * H-sweep (Phase 4): menubar keyboard races, activation end-to-end,
 * focus-loss paths, narrow-viewport menus, bn interplay.
 */

async function loadV2(page: Page): Promise<void> {
  await page.goto('/?cbv2=1');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

test('rapid Enter toggling on a title ends consistent (aria-expanded == menu)', async ({
  page,
}) => {
  await loadV2(page);
  const file = page.getByRole('menubar').getByRole('menuitem').first();
  await file.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('Enter');
  const expanded = (await file.getAttribute('aria-expanded')) === 'true';
  const open = (await page.locator('[role="menu"]').count()) > 0;
  expect(expanded).toBe(open); // no stuck state
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="menu"]')).toHaveCount(0);
});

test('20 rapid ArrowRights always leave a focused title (wrap, no dead end)', async ({
  page,
}) => {
  await loadV2(page);
  await page.getByRole('menubar').getByRole('menuitem').first().focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menubar').getByRole('menuitem').nth(2)).toBeFocused();
});

test('keyboard item activation runs the command (beat toggle flips) and closes', async ({
  page,
}) => {
  await loadV2(page);
  const beat = page.getByTestId('cb2-beat');
  const before = (await beat.getAttribute('aria-pressed')) === 'true';
  // View menu → Beat grid group → Toggle beat markers
  const view = page.getByRole('menubar').getByRole('menuitem', { name: 'View' });
  await view.focus();
  await page.keyboard.press('Enter');
  const menu = page.locator('[role="menu"][data-menu="view"]');
  await expect(menu).toBeVisible();
  await menu.locator('.menu-item', { hasText: 'Toggle beat markers' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[role="menu"]')).toHaveCount(0);
  await expect(beat).toHaveAttribute('aria-pressed', String(!before));
  await expect(view).toBeFocused();
});

test('outside click and Tab both dismiss an open menu', async ({ page }) => {
  await loadV2(page);
  const file = page.getByRole('menubar').getByRole('menuitem').first();
  await file.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[role="menu"][data-menu="file"]')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('[role="menu"]')).toHaveCount(0);
  await file.focus();
  await page.keyboard.press('Enter');
  await page.mouse.click(700, 450);
  await expect(page.locator('[role="menu"]')).toHaveCount(0);
});

test('menus operate at 320 px without page h-scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await loadV2(page);
  const view = page.getByRole('menubar').getByRole('menuitem', { name: 'View' });
  await view.focus();
  await page.keyboard.press('Enter');
  const menu = page.locator('[role="menu"][data-menu="view"]');
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(m.sw).toBeLessThanOrEqual(m.cw);
});

test('bn locale: menubar keyboard works and tooltips stay registry-derived', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('waveforge.locale', 'bn');
  });
  await page.goto('/?cbv2=1');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /নমুনা লোড/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
  const titles = page.getByRole('menubar').getByRole('menuitem');
  await titles.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(titles.nth(1)).toBeFocused(); // traversal is locale-independent
  await page.keyboard.press('Enter');
  await expect(page.locator('[role="menu"][data-menu="edit"]')).toBeVisible();
  // play tooltip: bn label + registry shortcut, no fabricated hints
  await expect(page.getByRole('button', { name: 'প্লে', exact: true })).toHaveAttribute(
    'title',
    'প্লে (Space)',
  );
});
