import { expect, test } from '@playwright/test';

/**
 * e2e flow #6 (plan §7.3) — offline capability. Runs in the
 * chromium-preview project: production build, `vite preview`, real service
 * worker. Load online once (SW installs + precaches), go offline, reload —
 * the full app must come back from the precache.
 */
test('flow #6: offline reload is fully functional', async ({ page }) => {
  await page.goto('/');

  // wait for the service worker to control the page (precache complete)
  await page.waitForFunction(
    () => navigator.serviceWorker.ready.then(() => Boolean(navigator.serviceWorker.controller)),
    { timeout: 20_000 },
  );

  // pull demo.wav into the cache too (it is precached, but loading it once
  // proves the offline path end-to-end below)
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 15_000 });

  // go offline and reload — the SW serves the precached shell
  await page.context().setOffline(true);
  await page.reload();

  await expect(page.getByRole('dialog', { name: /welcome/i })).toBeVisible({ timeout: 15_000 });
  await page
    .getByRole('dialog', { name: /welcome/i })
    .getByRole('button', { name: /load sample/i })
    .click();
  // decoding demo.wav offline proves workers/assets come from the precache
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 15_000 });
  // transport live: status bar reports the loaded document
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
});
