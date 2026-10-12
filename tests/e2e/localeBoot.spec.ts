import { expect, test } from '@playwright/test';

/**
 * P6.4 activation, end-to-end: a Bangla browser locale gets the Bangla
 * UI at boot (navigator.language detection in main bootstrap). English
 * locales keep the English UI.
 */

test.describe('bangla boot locale', () => {
  test.use({ locale: 'bn-BD' });

  test('bn browser → Bangla welcome dialog + Bangla View menu', async ({ page }) => {
    await page.goto('/');
    // bn welcomeTitle = "WaveForge-এ স্বাগতম"
    const welcome = page.getByRole('dialog', { name: /স্বাগতম/ });
    await expect(welcome).toBeVisible({ timeout: 10_000 });
    await welcome.getByRole('button', { name: /শুরু করুন|নমুনা লোড/ }).click();
    await expect(welcome).toHaveCount(0);

    // menus are Bangla; the Smart RAG toggle carries its bn label
    await page.getByRole('button', { name: 'ভিউ' }).click();
    await expect(page.getByRole('menuitem', { name: /স্মার্ট ট্রান্সক্রিপ্ট ফিচার/i })).toBeVisible();
  });
});

test.describe('english boot locale', () => {
  test.use({ locale: 'en-US' });

  test('en browser → English UI (regression guard)', async ({ page }) => {
    await page.goto('/');
    const welcome = page.getByRole('dialog', { name: /welcome/i });
    await expect(welcome).toBeVisible({ timeout: 10_000 });
    await expect(welcome.getByText(/100% in your browser/i).first()).toBeVisible();
  });
});
