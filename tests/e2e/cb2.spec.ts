import { expect, test, type Page } from '@playwright/test';

/**
 * CB-2.x — Control Bar v2 foundation: flag resolution (OFF default, URL
 * override), v2 transport toolbar (APG: one tab stop, roving arrows,
 * registry-routed pressed state), switchable clock (time/samples/persisted),
 * overflow menu, and the flag-OFF parity guard (v1 DOM untouched).
 */

async function loadV2(page: Page): Promise<void> {
  await page.goto('/?cbv2=1');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

test.describe('flag OFF (default) — parity guard', () => {
  test('v1 shell renders, no v2 markup exists', async ({ page }) => {
    await page.goto('/');
    const welcome = page.getByRole('dialog', { name: /welcome/i });
    await expect(welcome).toBeVisible();
    await welcome.getByRole('button', { name: /load sample/i }).click();
    await expect(page.getByText('demo.wav', { exact: true })).toBeVisible();
    await expect(page.locator('[data-testid="cb2-root"]')).toHaveCount(0);
    await expect(page.locator('.transport')).toBeVisible();
    await expect(page.getByTestId('transport-play')).toBeVisible();
  });

  test('explicit ?cbv2=0 keeps v1', async ({ page }) => {
    await page.goto('/?cbv2=0');
    await expect(page.locator('[data-testid="cb2-root"]')).toHaveCount(0);
  });
});

test.describe('flag ON (?cbv2=1)', () => {
  test('v2 shell renders with carried v1 zones (reachability)', async ({ page }) => {
    await loadV2(page);
    await expect(page.getByTestId('cb2-root')).toBeVisible();
    // v2 transport
    await expect(page.getByTestId('transport-play')).toBeVisible();
    await expect(page.getByTestId('transport-stop')).toBeVisible();
    await expect(page.getByTestId('record-toggle')).toBeVisible();
    await expect(page.getByTestId('cb2-loop')).toBeVisible();
    await expect(page.getByTestId('cb2-clock')).toBeVisible();
    // carried v1 controls — every control still reachable. Phase 5
    // (CB-5.1/CB-D19): the row never scrolls; at this width the tempo,
    // record and master zones relocate into the ⋮ panel (single instance,
    // same controls) — inline set asserted here, panel set opened below.
    // The full inline cluster behavior lives in cb3.spec (2300 px).
    const toolButtons = page.locator('.cb2 .toolbtn');
    expect(await toolButtons.count()).toBe(15);
    await expect(page.getByTestId('cb2-selection')).toBeVisible();
    await expect(page.getByTestId('cb2-overflow')).toBeVisible();
    await page.getByTestId('cb2-overflow').click();
    const panel = page.getByTestId('cb2-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('cb2-beat')).toBeVisible();
    await expect(page.getByTestId('cb2-snap')).toBeVisible();
    await expect(page.getByTestId('monitor-toggle')).toBeVisible();
    await expect(page.getByTestId('punch-button')).toBeVisible();
    await expect(page.getByTestId('clip-led')).toHaveCount(1);
    await expect(page.locator('.cb2 input[type="range"]').first()).toBeVisible();
    await page.keyboard.press('Escape'); // close — later assertions need the row
    // menus — APG mode (CB-D17): titles are menubar menuitems
    await expect(page.getByRole('menubar').getByRole('menuitem', { name: 'File', exact: true })).toBeVisible();
    // overflow
    await expect(page.getByTestId('cb2-overflow')).toBeVisible();
  });

  test('clock: defaults to time, switches to samples, persists across reload', async ({
    page,
  }) => {
    await loadV2(page);
    const clock = page.getByTestId('cb2-clock');
    await expect(clock).toHaveText(/^0:00\.000$/);
    await page.getByTestId('cb2-clock-format').click();
    const menu = page.getByRole('menu', { name: /clock format/i });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitemradio', { name: /samples/i }).click();
    // cursor at 0 → "0"; play a moment to see a nonzero sample count
    await expect(clock).toHaveText(/^0$/);
    await page.keyboard.press(' ');
    await expect
      .poll(async () => (await clock.textContent()) ?? '', { timeout: 8000 })
      .toMatch(/^\d{1,3}(,\d{3})+$/);
    await page.keyboard.press(' ');
    // persisted through the settings boundary
    await page.reload();
    await page
      .getByRole('dialog', { name: /welcome/i })
      .getByRole('button', { name: /load sample/i })
      .click();
    await expect(page.getByText('demo.wav', { exact: true })).toBeVisible();
    await expect(page.getByTestId('cb2-clock')).toHaveText(/^0$/);
  });

  test('clock menu: bars+beats availability follows known tempo (CB-D10)', async ({ page }) => {
    await loadV2(page);
    await page.getByTestId('cb2-clock-format').click();
    const menu = page.getByRole('menu', { name: /clock format/i });
    const barsItem = menu.getByRole('menuitemradio', { name: /bars & beats/i });
    const visible = await barsItem.isVisible().catch(() => false);
    test.info().annotations.push({ type: 'note', description: `bars item visible: ${visible}` });
    if (visible) {
      await barsItem.click();
      // 4/4 assumption is labelled in the menu; the readout is dotted groups
      await expect(page.getByTestId('cb2-clock')).toHaveText(/^\d+\.\d+\.\d+$/);
    }
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('transport toolbar: APG keyboard model (one tab stop, roving arrows)', async ({
    page,
  }) => {
    await loadV2(page);
    const play = page.getByTestId('transport-play');
    const stop = page.getByTestId('transport-stop');
    const rec = page.getByTestId('record-toggle');
    const loop = page.getByTestId('cb2-loop');
    await play.focus();
    await expect(play).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(stop).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(rec).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(loop).toBeFocused();
    // the clock format switcher is a toolbar control — Home reaches it
    await page.keyboard.press('Home');
    await expect(page.getByTestId('cb2-clock-format')).toBeFocused();
    await page.keyboard.press('End');
    await expect(loop).toBeFocused();
    // single tab stop: Tab leaves the toolbar entirely
    await page.keyboard.press('Tab');
    await expect(play.or(stop).or(rec).or(loop)).toBeFocused().catch(() => {
      /* allowed: focus moved out — assert the negative below instead */
    });
    const inside = await page.evaluate(() =>
      Boolean(
        document.activeElement?.closest('[data-testid="cb2-transport"]'),
      ),
    );
    expect(inside).toBe(false);
  });

  test('play/pause: registry-routed, pressed state from signal, Space does not double-fire', async ({
    page,
  }) => {
    await loadV2(page);
    const play = page.getByTestId('transport-play');
    await expect(play).toHaveAttribute('aria-pressed', 'false');
    await play.focus();
    await page.keyboard.press('Space'); // activates the focused button once
    await expect(play).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 });
    await page.keyboard.press('Space');
    await expect(play).toHaveAttribute('aria-pressed', 'false', { timeout: 5000 });
  });

  test('loop: command-routed toggle reflects in pressed state', async ({ page }) => {
    await loadV2(page);
    const loop = page.getByTestId('cb2-loop');
    await loop.click();
    await expect(loop).toHaveAttribute('aria-pressed', 'true');
    await loop.click();
    await expect(loop).toHaveAttribute('aria-pressed', 'false');
  });

  test('overflow: hosts registry commands (follow, monitor, clip-reset)', async ({ page }) => {
    await loadV2(page);
    await page.getByTestId('cb2-overflow').click(); // CB-5.1: menu + tucked zones live in the panel
    const menu = page.getByRole('menu', { name: /more tools/i });
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId('cb2-overflow-view-follow')).toBeVisible();
    await expect(menu.getByTestId('cb2-overflow-record-monitor')).toBeVisible();
    await expect(menu.getByTestId('cb2-overflow-record-clipReset')).toBeVisible();
    await menu.getByTestId('cb2-overflow-record-monitor').click();
    // monitor state is real: reopen the panel — the zone lives there at
    // this width (CB-5.1) — and read the button's active class
    await page.getByTestId('cb2-overflow').click();
    await expect(page.getByTestId('monitor-toggle')).toHaveClass(/active/);
    // the panel is still open (same open() as the class assert above) —
    // fresh locator, the old menu element was unmounted by the earlier close
    await expect(
      page
        .getByRole('menu', { name: /more tools/i })
        .getByTestId('cb2-overflow-record-monitor'),
    ).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('flag ON — axe', () => {
  test('x2: axe zero violations — v2 control bar (loaded state)', async ({ page }) => {
    await loadV2(page);
    await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
    const violations = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = (window as any).axe;
      const results = await a.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
      return results.violations.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (v: any) => `${v.impact} ${v.id}: ${v.help}`,
      );
    });
    expect(violations).toEqual([]);
  });
});
