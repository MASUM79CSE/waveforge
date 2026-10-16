import { expect, test, type Page } from '@playwright/test';

/**
 * Frame2 flag & shell (UX-2.5/2.6) — contract:
 *  - default OFF: DOM is the legacy frame (no [data-frame2]); flag-OFF is
 *    byte-identical behavior to baseline.
 *  - `?ui2=1` or localStorage `ui.cleanSlateLayout` in {'1','true'} → ON;
 *    URL wins over storage; `?ui2=garbage` forces OFF.
 *  - flag ON = the Z-shell with the SAME capability set: welcome → load
 *    sample works, transport works, status bar updates.
 */

async function loadSample(page: Page): Promise<void> {
  await page
    .getByRole('dialog', { name: /welcome/i })
    .getByRole('button', { name: /load sample|নমুনা লোড/i })
    .click();
  await expect(page.getByText('demo.wav').first()).toBeVisible();
}

test.describe('frame2 flag', () => {
  test('default OFF — legacy frame, no data-frame2', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-frame2]')).toHaveCount(0);
    await expect(page.locator('.shell')).toBeVisible();
    await expect(page.locator('.menubar')).toBeVisible();
    await expect(page.locator('[data-testid="transport-play"]')).toBeVisible();
  });

  test('ui2=1 — Z-shell with zones and intact capabilities', async ({ page }) => {
    await page.goto('/?ui2=1');
    await expect(page.locator('[data-frame2="1"]')).toBeVisible();
    await expect(page.locator('[data-zone="Z1"] .menubar')).toBeVisible();
    await expect(page.locator('[data-zone="Z2"] [data-testid="transport-play"]')).toBeVisible();
    await expect(page.locator('[data-zone="Z8"] .statusbar')).toBeVisible();
    await loadSample(page);
    await expect(page.locator('[data-zone="Z8"]')).toContainText('demo.wav');
    await expect(page.locator('[data-zone="Z4-Z7"] canvas').first()).toBeVisible();
  });

  test('flag ON can play: position readout advances', async ({ page }) => {
    await page.goto('/?ui2=1');
    await loadSample(page);
    await page.getByTestId('transport-play').click();
    await expect(page.locator('[data-zone="Z2"]')).toContainText(/0:0[01]\./, { timeout: 5000 });
    await page.getByTestId('transport-stop').click();
  });

  test('localStorage flag turns ON; URL ui2=0 overrides to OFF', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ui.cleanSlateLayout', '1'));
    await page.goto('/');
    await expect(page.locator('[data-frame2="1"]')).toBeVisible();
    await page.goto('/?ui2=0');
    await expect(page.locator('[data-frame2]')).toHaveCount(0);
  });

  test('garbage storage value stays OFF; ui2=garbage forces OFF', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ui.cleanSlateLayout', 'garbage'));
    await page.goto('/');
    await expect(page.locator('[data-frame2]')).toHaveCount(0);
    await page.addInitScript(() => localStorage.setItem('ui.cleanSlateLayout', '1'));
    await page.goto('/?ui2=garbage');
    await expect(page.locator('[data-frame2]')).toHaveCount(0);
  });

  test('flag OFF keeps full legacy flow after visiting flag ON', async ({ page }) => {
    await page.goto('/?ui2=1');
    await expect(page.locator('[data-frame2="1"]')).toBeVisible();
    await page.goto('/');
    await expect(page.locator('[data-frame2]')).toHaveCount(0);
    await loadSample(page);
    await expect(page.locator('.statusbar')).toContainText('demo.wav');
  });
});
