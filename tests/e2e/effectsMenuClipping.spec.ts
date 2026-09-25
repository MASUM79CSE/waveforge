import { expect, test } from '@playwright/test';

/**
 * e2e #54 — effects dropdown text clipping (layout/container fix):
 * every label fully readable at all supported viewports — no ellipsis
 * clip, no hidden overflow, menu inside the viewport, no page-level
 * horizontal scroll. One-line labels on desktop, complete wrap on
 * narrow screens (docs/task_list.md — dropdown width fix).
 */

const SIZES: Array<[number, number]> = [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 700],
  [600, 700],
  [480, 700],
  [375, 700],
];

test('effects menu: complete labels, in viewport, no page h-scroll at every size', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /skip|close|✕/i }).first().click().catch(() => {});

  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'Effects', exact: true }).click();
    const dropdown = page.locator('.menu-dropdown');
    await expect(dropdown).toBeVisible();

    // 1) NO clipped labels: scrollWidth must never exceed the visible box
    const clipped = await dropdown
      .locator('.menu-label')
      .evaluateAll((els) =>
        els
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => (el.textContent ?? '').trim()),
      );
    expect(clipped, `clipped labels at ${width}px`).toEqual([]);

    // 1b) the dropdown itself never hides content horizontally (the
    // ellipsis clip used to hide behind its overflow-y scroll region)
    const menuClip = await dropdown.evaluate(
      (el) => el.scrollWidth - el.clientWidth,
    );
    expect(menuClip, `dropdown hides content at ${width}px`).toBeLessThanOrEqual(1);

    // 2) the five longest names are present in full
    for (const name of [
      /Noise Reduction v3 \(natural voice\)/,
      /Noise Reduction \(print\)/,
      /AI Voice Clarity \(RNNoise\)/,
      /Parametric EQ \(8-band\)/,
      /Graphic EQ \(20-band\)/,
    ]) {
      await expect(dropdown.getByRole('menuitem', { name })).toBeVisible();
    }

    // 3) dropdown stays inside the viewport (no offscreen edges)
    const box = await dropdown.boundingBox();
    expect(box, `dropdown box at ${width}px`).toBeTruthy();
    expect(box!.x, `left edge at ${width}px`).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width, `right edge at ${width}px`).toBeLessThanOrEqual(width + 1);

    // 4) desktop-class widths keep the longest label on ONE line
    if (width >= 768) {
      const long = await dropdown.getByRole('menuitem', { name: /Noise Reduction v3/ }).boundingBox();
      expect(long, `long item box at ${width}px`).toBeTruthy();
      expect(long!.height, `one-line label at ${width}px`).toBeLessThan(30);
    }

    // 5) the open menu never INTRODUCES page-level horizontal scrolling
    // (the desktop chrome itself overflows below ~460px — pre-existing,
    // out of scope; the dropdown must not add to it)
    const open = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.getByRole('button', { name: 'Effects', exact: true }).click();
    await expect(dropdown).toHaveCount(0);
    const closed = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(open, `menu-induced page h-scroll at ${width}px`).toBeLessThanOrEqual(closed + 1);
    if (closed <= width) {
      expect(open, `page scrollWidth at ${width}px`).toBeLessThanOrEqual(width);
    }
    continue;
  }
});
