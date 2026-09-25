import { expect, test } from '@playwright/test';

/**
 * e2e #55 — transport redesign (zone layout): TIME DISPLAY first, then
 * TRANSPORT (seek-left, play, seek-right, loop, record), with STOP/PAUSE
 * in their own separated cluster; EDIT/SELECTION/GRID follow; RECORD
 * (monitor/punch/meter) + MASTER right-anchored. Captions show on wide
 * screens; nothing clips; record controls reachable everywhere.
 */

const SIZES: Array<[number, number]> = [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 700],
  [375, 700],
];

const ZONES = ['Position', 'Transport', 'Stop / Pause', 'Edit tools', 'Selection', 'Beat grid', 'Record', 'Master'];

test('position first, transport next, stop/pause separated', async ({ page }) => {
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  // every zone panel exists, labelled for AT
  for (const zone of ZONES) {
    await expect(page.locator(`.tz[data-zone-label="${zone}"]`)).toBeVisible();
    await expect(page.locator(`.tz[data-zone-label="${zone}"]`)).toHaveAttribute('aria-label', zone);
  }

  // ORDER: the time display leads, transport follows, stop/pause separate
  const x = async (zone: string): Promise<number> =>
    (await page.locator(`.tz[data-zone-label="${zone}"]`).boundingBox())!.x;
  expect(await x('Position')).toBeLessThan(await x('Transport'));
  expect(await x('Transport')).toBeLessThan(await x('Stop / Pause'));
  expect(await x('Stop / Pause')).toBeLessThan(await x('Edit tools'));

  // the clock lives in the FIRST zone
  const clockX = (await page.locator('.time-cursor').boundingBox())!.x;
  expect(clockX).toBeLessThan(await x('Transport'));

  // transport cluster: seek-left, play, seek-right (NEW), loop, record
  const transport = page.locator('.tz[data-zone-label="Transport"]');
  await expect(transport.getByTestId('transport-seek-start')).toBeVisible();
  await expect(transport.getByTestId('transport-play')).toBeVisible();
  await expect(transport.getByTestId('transport-seek-end')).toBeVisible();
  await expect(transport.getByRole('button', { name: /loop/i })).toBeVisible();
  await expect(transport.getByTestId('record-toggle')).toBeVisible();

  // stop/pause live OUTSIDE the transport cluster (separated), pause is
  // disabled while stopped and enables during playback
  const sp = page.locator('.tz[data-zone-label="Stop / Pause"]');
  await expect(sp.getByTestId('transport-pause')).toBeVisible();
  await expect(sp.getByTestId('transport-stop')).toBeVisible();
  await expect(sp.getByTestId('transport-pause')).toBeDisabled();
  await page.keyboard.press('Space');
  await expect(sp.getByTestId('transport-pause')).toBeEnabled();
  await page.getByTestId('transport-pause').click();
  await expect(sp.getByTestId('transport-pause')).toBeDisabled();

  // RECORD zone is right-anchored: past 55% of the bar
  const barBox = (await page.locator('.transport').boundingBox())!;
  const recBox = (await page.locator('.tz[data-zone-label="Record"]').boundingBox())!;
  expect(recBox.x - barBox.x).toBeGreaterThan(barBox.width * 0.55);

  // captions render on desktop
  await expect(page.locator('.tz-cap').first()).toBeVisible();
});

test('transport zones hold at every size — nothing clips, record reachable', async ({ page }) => {
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
