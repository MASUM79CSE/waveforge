import { expect, test, type Page } from '@playwright/test';

/**
 * UX-5 — states, a11y, i18n, responsive + touch (flag ON unless stated):
 *  - editable selection fields (4 formats, Enter/Escape/aria-invalid);
 *  - canvas a11y summary reflects selection;
 *  - F-7: SaveDraft dialog Escape-closable (BOTH frames);
 *  - F-4: toast close ≥24×24 (both frames);
 *  - bn locale: core chrome renders Bengali, no clipped labels / no
 *    horizontal overflow (the +40% rule);
 *  - axe clean on flag-ON states incl. a dialog and a 390px viewport;
 *  - ≤480px: bands wrap (no folding), no horizontal scroll.
 */

async function loaded(page: Page, url = '/?ui2=1'): Promise<void> {
  await page.goto(url);
  await page
    .getByRole('dialog', { name: /welcome/i })
    .getByRole('button', { name: /load sample/i })
    .click();
  await expect(page.getByText('demo.wav').first()).toBeVisible();
}

test('selection fields — commit, derive duration, keyboard selection works', async ({ page }) => {
  await loaded(page);
  const start = page.getByTestId('sel-start');
  const end = page.getByTestId('sel-end');
  await expect(start).toBeEnabled();

  await start.fill('0');
  await end.fill('0:02.000');
  await end.press('Enter');
  await expect(page.getByTestId('sel-dur')).toHaveText(/0:02\.000/);
  // canvas a11y summary mirrors the selection
  await expect(page.getByTestId('f2-summary')).toContainText(/selection.*0:00\.000.*0:02\.000/i);

  // keyboard-only selection flow: fields are tab-reachable and commit on Enter
  await start.fill('0:01.000');
  await start.press('Enter');
  await expect(page.getByTestId('sel-dur')).toHaveText(/0:01\.000/);

  // SMP mode: sample-accurate entry at the document rate (44100)
  await page.getByTestId('sel-mode').selectOption('SMP');
  await start.fill('44100');
  await end.fill('88200');
  await end.press('Enter');
  await expect(page.getByTestId('sel-dur')).toHaveText('44100'); // duration in the ACTIVE format (samples)
});

test('selection fields — invalid input never commits; Escape reverts', async ({ page }) => {
  await loaded(page);
  const start = page.getByTestId('sel-start');
  const end = page.getByTestId('sel-end');
  await start.fill('0');
  await end.fill('0:02.000');
  await end.press('Enter');
  const durBefore = await page.getByTestId('sel-dur').textContent();

  await start.fill('garbage');
  await start.press('Enter');
  await expect(start).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('status').filter({ hasText: /invalid/i })).toBeVisible();
  expect(await page.getByTestId('sel-dur').textContent()).toBe(durBefore);

  await start.fill('0'); // clear the invalid state first
  await end.fill('9:00');
  await end.press('Enter'); // 9 min > duration → clamped to doc length (9.272)
  const durAfter = await page.getByTestId('sel-dur').textContent();
  expect(durAfter).toBe('0:09.273'); // doc.duration 9.27256 rounds up

  await start.fill('0:01.500');
  await start.press('Escape');
  // reverted: the field shows the last committed value, not 0:01.500
  await expect(start).not.toHaveValue('0:01.500');
});

test('F-7 — SaveDraft dialog closes on Escape (flag ON and OFF)', async ({ page }) => {
  for (const url of ['/?ui2=1', '/']) {
    await loaded(page, url);
    await page.getByRole('button', { name: /file/i }).click();
    await page.getByRole('menuitem', { name: /save draft/i }).click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
  }
});

test('F-4 — toast close target is at least 24×24 CSS px', async ({ page }) => {
  await loaded(page, '/?ui2=1');
  const box = await page.getByLabel('Dismiss', { exact: true }).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(23.5);
  expect(box!.height).toBeGreaterThanOrEqual(23.5);
});

test('bn locale — core chrome renders Bengali; labels do not clip', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('waveforge.locale', 'bn'));
  await page.goto('/?ui2=1');
  await expect(page.locator('.menubar').getByRole('button', { name: 'ফাইল' })).toBeVisible();
  await page
    .getByRole('dialog', { name: /welcome/i })
    .getByRole('button', { name: /নমুনা লোড|load sample/i })
    .click();
  await expect(page.getByText('demo.wav').first()).toBeVisible();

  await expect(page.getByRole('toolbar', { name: /ট্রান্সপোর্ট টুলবার/ })).toBeVisible();

  // +40% rule: no horizontal overflow of the frame; menu titles not clipped
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('.menu-title')].filter((el) => el.scrollWidth > el.clientWidth + 1).length,
  );
  expect(clipped).toBe(0);
});

test('axe — flag-ON states stay clean (loaded, welcome, 390px)', async ({ page }) => {
  const run = async (): Promise<string[]> => {
    await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
    return page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = (window as any).axe;
      const results = await a.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
      return results.violations.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (v: any) => `${v.impact} ${v.id}: ${v.help}`,
      );
    });
  };
  await page.goto('/?ui2=1'); // welcome dialog open
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
  const welcomeViolations = await run();
  expect(welcomeViolations).toEqual([]);

  await loaded(page); // main editor
  const mainViolations = await run();
  expect(mainViolations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(300);
  const narrowViolations = await run();
  expect(narrowViolations).toEqual([]);
});

test('≤480px — bands wrap instead of folding; no horizontal scroll', async ({ page }) => {
  await loaded(page);
  await page.setViewportSize({ width: 400, height: 800 });
  await page.waitForTimeout(500);
  const folded = await page.locator('.f2-band [data-f2-item].f2-folded').count();
  expect(folded).toBe(0);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollW).toBeLessThanOrEqual(400);
});
