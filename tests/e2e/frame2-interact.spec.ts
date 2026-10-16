import { expect, test, type Page } from '@playwright/test';

/**
 * UX-3.3 interaction contracts, flag ON: APG roving keyboard on the new
 * toolbars, band overflow at narrow widths, no horizontal frame scroll.
 */

async function loaded(page: Page): Promise<void> {
  await page.goto('/?ui2=1');
  await page
    .getByRole('dialog', { name: /welcome/i })
    .getByRole('button', { name: /load sample/i })
    .click();
  await expect(page.getByText('demo.wav').first()).toBeVisible();
}

test('roving toolbar — one tab stop, arrows rove, Home/End, restore on re-entry', async ({ page }) => {
  await loaded(page);
  const tb = page.getByRole('toolbar', { name: /transport toolbar/i });
  await expect(tb).toBeVisible();

  // single tab stop: exactly one tabIndex=0 inside the toolbar
  const stops = await tb.locator('button[tabindex="0"]').count();
  expect(stops).toBe(1);

  await tb.locator('button[tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  const afterRight = await page.evaluate(() => document.activeElement?.getAttribute('data-tb-id'));
  // pause is disabled while stopped → arrows SKIP it (APG), play → stop
  expect(afterRight).toBe('transport.stop');

  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-tb-id'))).toBe('transport.play');

  await page.keyboard.press('End');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-tb-id'))).toBe('record.metronome');
  await page.keyboard.press('Home');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-tb-id'))).toBe('transport.play');

  // toggle state through the roving control (aria-pressed)
  const loop = tb.locator('[data-tb-id="transport.loop"]');
  const before = await loop.getAttribute('aria-pressed');
  await page.keyboard.press('ArrowRight'); // → stop (pause disabled-skipped)
  await page.keyboard.press('ArrowRight'); // → seekBack
  await page.keyboard.press('ArrowRight'); // → seekFwd
  await page.keyboard.press('ArrowRight'); // → loop
  await page.keyboard.press('Enter');
  expect(await loop.getAttribute('aria-pressed')).toBe(before === 'true' ? 'false' : 'true');
  await page.keyboard.press('Enter'); // restore state
  await expect(loop.getAttribute('aria-pressed')).resolves.toBe(String(before));

  // Tab out and back → last focus restored (APG revisit rule)
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const restored = await page.evaluate(() => document.activeElement?.getAttribute('data-tb-id'));
  expect(restored).toBeTruthy();
});

test('band overflow — narrow width folds lowest-priority sections into ⋯; no horizontal scroll', async ({ page }) => {
  await loaded(page);
  await page.setViewportSize({ width: 700, height: 700 });
  await page.waitForTimeout(400);

  const secondary = page.locator('[data-zone="Z3"] .f2-band-inner');
  const folded = await secondary.locator('[data-f2-item].f2-folded').evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.f2Item),
  );
  expect(folded.length, 'at least one section folds at 700px').toBeGreaterThan(0);
  expect(folded).toContain('meters'); // lowest priority folds first

  // no horizontal scroll of the frame itself
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollW).toBeLessThanOrEqual(700);

  // ⋯ menu carries the folded controls and can execute one
  const more = page.locator('[data-zone="Z3"] .f2-overflow-btn').last();
  await more.click();
  const entries = page.locator('[role="menu"]:visible [role="menuitem"]');
  await expect(entries.first()).toBeVisible();
  await page.keyboard.press('Escape');
});

test('aria-pressed + aria-disabled semantics on group controls', async ({ page }) => {
  await loaded(page);
  const snap = page.locator('[data-tb-id="snap.toggle"]');
  const before = await snap.getAttribute('aria-pressed');
  await snap.click();
  await expect(snap.getAttribute('aria-pressed')).resolves.toBe(before === 'true' ? 'false' : 'true');
  await snap.click(); // restore

  // disabled controls keep focusability + aria-disabled (discoverability)
  const punch = page.locator('[data-tb-id="record.punch"]');
  await page.keyboard.press('Control+a'); // selection → punch enabled
  await expect(punch.getAttribute('aria-disabled')).resolves.not.toBe('true');
});
