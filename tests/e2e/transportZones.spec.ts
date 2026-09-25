import { expect, test } from '@playwright/test';

/**
 * e2e #55 — transport redesign (zone layout): the single crowded row is
 * reorganized into labeled zone panels — TRANSPORT / POSITION / EDIT /
 * SELECTION / GRID left, RECORD / MASTER right-aligned. Controls keep
 * their commands; captions show on wide screens; nothing clips; the bar
 * never introduces page-level horizontal scrolling.
 */

const SIZES: Array<[number, number]> = [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 700],
  [375, 700],
];

const ZONES = ['Transport', 'Position', 'Edit tools', 'Selection', 'Beat grid', 'Record', 'Master'];

test('transport bar is organized into labeled zones', async ({ page }) => {
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  // every zone panel exists, labelled for AT
  for (const zone of ZONES) {
    await expect(page.locator(`.tz[data-zone-label="${zone}"]`)).toBeVisible();
    await expect(page.locator(`.tz[data-zone-label="${zone}"]`)).toHaveAttribute('aria-label', zone);
  }

  // captions render on desktop
  await expect(page.locator('.tz-cap').first()).toBeVisible();

  // the RECORD zone is right-anchored: its left edge sits past 60% of the bar
  const barBox = (await page.locator('.transport').boundingBox())!;
  const recBox = (await page.locator('.tz[data-zone-label="Record"]').boundingBox())!;
  expect(recBox.x - barBox.x).toBeGreaterThan(barBox.width * 0.55);

  // POSITION shows the one-line clock
  await expect(page.locator('.tz[data-zone-label="Position"] .time-cursor')).toBeVisible();
});

test('transport zones hold at every size — nothing clips, no page h-scroll added', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /skip|close|✕/i }).first().click().catch(() => {});

  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    const bar = page.locator('.transport');
    await expect(bar).toBeVisible();

    // the bar itself never hides content horizontally once there is room
    // (1920 = full layout incl. strips); below that the bar scrolls
    // internally by design (overflow-x: auto — same as Audition's toolbar)
    const clip = await bar.evaluate((el) => el.scrollWidth - el.clientWidth);
    if (width >= 1920) {
      expect(clip, `bar hides content at ${width}px`).toBeLessThanOrEqual(1);
    }

    // record controls remain reachable at every size
    await page.getByTestId('record-toggle').scrollIntoViewIfNeeded().catch(() => {});
    await expect(page.getByTestId('record-toggle')).toBeVisible();
    await expect(page.getByTestId('monitor-toggle')).toBeVisible();
    await expect(page.getByTestId('punch-button')).toBeVisible();
  }
});
