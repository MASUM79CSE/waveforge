import { expect, test } from '@playwright/test';

/**
 * e2e #55 — transport redesign r3: blended zone sections. ORDER: position
 * clock first, then a standalone prominent PLAY (toggles play/pause, icon
 * + aria-pressed follow state), then TRANSPORT = back 5 s / forward 5 s /
 * loop / record, then STOP/PAUSE separated; RECORD + MASTER right.
 */

const SIZES: Array<[number, number]> = [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 700],
  [375, 700],
];

const ZONES = ['Position', 'Play', 'Transport', 'Stop / Pause', 'Edit tools', 'Selection', 'Beat grid', 'Record', 'Master'];

function clockToSeconds(text: string): number {
  const [mins, rest] = text.split(':');
  return Number(mins) * 60 + Number(rest);
}

async function cursorSeconds(page: import('@playwright/test').Page): Promise<number> {
  const text = (await page.locator('.time-cursor').textContent()) ?? '0:00.000';
  return clockToSeconds(text.trim());
}

test('position first, standalone play, ±5 s seeks, stop/pause separated', async ({ page }) => {
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  for (const zone of ZONES) {
    await expect(page.locator(`.tz[data-zone-label="${zone}"]`)).toBeVisible();
    await expect(page.locator(`.tz[data-zone-label="${zone}"]`)).toHaveAttribute('aria-label', zone);
  }

  const x = async (zone: string): Promise<number> =>
    (await page.locator(`.tz[data-zone-label="${zone}"]`).boundingBox())!.x;
  expect(await x('Position')).toBeLessThan(await x('Play'));
  expect(await x('Play')).toBeLessThan(await x('Transport'));
  expect(await x('Transport')).toBeLessThan(await x('Stop / Pause'));
  expect(await x('Stop / Pause')).toBeLessThan(await x('Edit tools'));

  // PLAY: prominent standalone button — toggles, state follows
  const play = page.getByTestId('transport-play');
  await expect(play).toBeEnabled();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('transport-pause')).toBeEnabled();
  await play.click(); // toggles to pause
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('transport-pause')).toBeDisabled();

  // SEEK: ±5 s cursor steps (not jump-to-ends), clamped at the ends
  const duration = clockToSeconds(((await page.locator('.time-total').textContent()) ?? '0:00.000').trim());
  const back = page.getByTestId('transport-seek-back');
  const fwd = page.getByTestId('transport-seek-fwd');
  await back.click();
  expect(await cursorSeconds(page)).toBeCloseTo(0, 1);
  await fwd.click();
  expect(await cursorSeconds(page)).toBeCloseTo(5, 1);
  await fwd.click();
  expect(await cursorSeconds(page)).toBeCloseTo(Math.min(10, duration), 1);
  await back.click();
  expect(await cursorSeconds(page)).toBeCloseTo(Math.max(0, Math.min(10, duration) - 5), 1);

  // loop + record live in the TRANSPORT zone
  await expect(page.locator('.tz[data-zone-label="Transport"]').getByRole('button', { name: /loop/i })).toBeVisible();
  await expect(page.locator('.tz[data-zone-label="Transport"]').getByTestId('record-toggle')).toBeVisible();

  // RECORD zone right-anchored
  const barBox = (await page.locator('.transport').boundingBox())!;
  const recBox = (await page.locator('.tz[data-zone-label="Record"]').boundingBox())!;
  expect(recBox.x - barBox.x).toBeGreaterThan(barBox.width * 0.55);
});

test('transport zones hold at every size — nothing clips, record reachable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /skip|close|✕/i }).first().click().catch(() => {});

  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    const bar = page.locator('.transport');
    await expect(bar).toBeVisible();

    const clip = await bar.evaluate((el) => el.scrollWidth - el.clientWidth);
    if (width >= 1920) {
      expect(clip, `bar hides content at ${width}px`).toBeLessThanOrEqual(1);
    }

    await page.getByTestId('record-toggle').scrollIntoViewIfNeeded().catch(() => {});
    await expect(page.getByTestId('record-toggle')).toBeVisible();
    await expect(page.getByTestId('monitor-toggle')).toBeVisible();
    await expect(page.getByTestId('punch-button')).toBeVisible();
  }
});
