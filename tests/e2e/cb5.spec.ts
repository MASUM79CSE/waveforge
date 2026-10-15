import { expect, test, type Page } from '@playwright/test';

/**
 * CB-5.x — responsive + a11y hardening: priority overflow (CB-5.1: the row
 * never internally scrolls; tucked zones stay reachable — and editable —
 * inside the ⋮ panel), measured ≥24 px targets (CB-5.2), zoom/reduced-
 * motion/long-label/no-audio states (CB-5.3), axe clean at all widths
 * (CB-5.4). Method note: browser zoom is emulated by equivalent CSS
 * viewport widths (1280 @200% ≈ 640, @400% ≈ 320) — documented in the
 * Phase-5 report.
 */

const WIDTHS = [1280, 1024, 768, 390, 320] as const;

async function loadV2(page: Page, query = '?cbv2=1'): Promise<void> {
  await page.goto(`/${query}`);
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

async function openPanel(page: Page): Promise<void> {
  await page.getByTestId('cb2-overflow').click();
  await expect(page.getByTestId('cb2-panel')).toBeVisible();
}

test.describe('CB-5.1 priority overflow', () => {
  for (const width of WIDTHS) {
    test(`${width}px: zero page h-scroll AND zero row overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await loadV2(page);
      const m = await page.evaluate(() => {
        const row = document.querySelector('.cb2-row');
        const de = document.documentElement;
        return {
          page: de.scrollWidth - de.clientWidth,
          row: row ? row.scrollWidth - row.clientWidth : -1,
        };
      });
      expect(m.page).toBeLessThanOrEqual(0);
      expect(m.row).toBeLessThanOrEqual(0);
    });
  }

  test('1280: transport+toolbar+selection inline; tempo/record/master in the panel', async ({
    page,
  }) => {
    await loadV2(page);
    await expect(page.getByTestId('cb2-selection')).toBeVisible();
    await expect(page.locator('.cb2 .toolbar')).toBeVisible();
    await expect(page.getByTestId('cb2-tempo')).toHaveCount(0); // tucked
    await expect(page.getByTestId('cb2-master-vol')).toHaveCount(0);
    await openPanel(page);
    await expect(page.getByTestId('cb2-tempo')).toBeVisible();
    await expect(page.getByTestId('cb2-rec-slot').first()).toBeVisible();
    await expect(page.getByTestId('cb2-master-vol')).toBeVisible();
  });

  test('390: transport+overflow inline; selection editable inside the panel', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await loadV2(page);
    await expect(page.getByTestId('cb2-selection')).toHaveCount(0); // tucked
    await openPanel(page);
    const start = page.getByTestId('cb2-sel-start');
    await expect(start).toBeVisible();
    await start.fill('0:00.750');
    await start.press('Enter');
    await expect(start).toHaveValue(/0:00\.7/);
    // panel stays inside the viewport (no offscreen escape hatch)
    const box = await page.getByTestId('cb2-panel').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });

  test('panel Escape closes and returns focus to the ⋮ trigger', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 800 });
    await loadV2(page);
    const trigger = page.getByTestId('cb2-overflow');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('cb2-panel')).toBeVisible();
    await page.waitForTimeout(150); // let the open-effects settle
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('cb2-panel')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('outside click closes the panel', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 800 });
    await loadV2(page);
    const trigger = page.getByTestId('cb2-overflow');
    await trigger.click();
    await expect(page.getByTestId('cb2-panel')).toBeVisible();
    await page.waitForTimeout(150);
    await page.mouse.click(60, 500);
    await expect(page.getByTestId('cb2-panel')).toHaveCount(0);
  });
});

test.describe('CB-5.2 target sizes ≥ 24', () => {
  for (const width of [1280, 320]) {
    test(`${width}px: every .cb2 interactive measures ≥24×24`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await loadV2(page);
      await openPanel(page); // panel controls are part of the bar surface
      const small = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll(
          '.cb2 button, .cb2 input, .cb2 [role="menuitem"]',
        )) {
          const b = el.getBoundingClientRect();
          if (b.width > 0 && (b.width < 24 || b.height < 24)) {
            out.push(
              `${el.getAttribute('data-testid') ?? el.className}:${Math.round(b.width)}x${Math.round(b.height)}`,
            );
          }
        }
        return out;
      });
      expect(small).toEqual([]);
    });
  }
});

test.describe('CB-5.4 axe at widths', () => {
  for (const width of [1280, 768, 320]) {
    test(`${width}px: axe zero violations (panel open state included)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await loadV2(page);
      await openPanel(page);
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
      const violations = await page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = await (window as any).axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
        });
        return r.violations.map((v: { impact: string; id: string; help: string }) =>
          `${v.impact} ${v.id}: ${v.help}`,
        );
      });
      expect(violations).toEqual([]);
    });
  }
});

test.describe('CB-5.3 states', () => {
  test('reduced motion: play toggle + panel still work', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadV2(page);
    const play = page.getByRole('button', { name: 'Play', exact: true });
    await play.click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await openPanel(page);
    await expect(page.getByTestId('cb2-panel')).toBeVisible();
  });

  test('zoom 200%/400% (viewport 640/320): fits, panel reachable, nothing clipped', async ({
    page,
  }) => {
    for (const width of [640, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await loadV2(page);
      const m = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        row: document.querySelector('.cb2-row')
          ? document.querySelector('.cb2-row')!.scrollWidth -
            document.querySelector('.cb2-row')!.clientWidth
          : -1,
      }));
      expect(m.page).toBeLessThanOrEqual(0);
      expect(m.row).toBeLessThanOrEqual(0);
      await openPanel(page);
      await expect(page.getByTestId('cb2-sel-start')).toBeVisible();
    }
  });

  test('bn long labels at 390: no overflow, panel labels render', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('waveforge.locale', 'bn');
    });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/?cbv2=1');
    const welcome = page.getByRole('dialog', { name: /welcome/i });
    await welcome.getByRole('button', { name: /নমুনা লোড/i }).click();
    await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
    await openPanel(page);
    await expect(page.getByRole('group', { name: 'নির্বাচন' })).toBeVisible();
    const m = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(m.page).toBeLessThanOrEqual(0);
  });

  test('no audio: bar is stable and the panel opens without a document', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?cbv2=1');
    const welcome = page.getByRole('dialog', { name: /welcome/i });
    await page.mouse.click(4, 400); // dismiss welcome without loading
    await expect(welcome).toHaveCount(0);
    await expect(page.getByTestId('cb2-sel-start')).toBeDisabled();
    await openPanel(page);
    await expect(page.getByTestId('cb2-panel')).toBeVisible();
    await expect(page.getByTestId('cb2-overflow-view-follow')).toBeVisible();
  });
});
