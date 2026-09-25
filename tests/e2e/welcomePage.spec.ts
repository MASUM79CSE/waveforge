import { expect, test } from '@playwright/test';

/**
 * e2e #58 — welcome page redesign: hero logo is LARGE, the two action
 * buttons are centered, the AudioMass inspired-by credit is gone from the
 * dialog (it remains in About + LICENSE), and a professional developer
 * credit card is present (name, email, instagram, discord, avatar with
 * monogram fallback).
 */

async function openWelcome(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: /welcome/i })).toBeVisible();
}

test('welcome: large logo, centered actions, no inspired-by, developer card', async ({ page }) => {
  await openWelcome(page);
  const dialog = page.getByRole('dialog', { name: /welcome/i });

  // 1) the logo renders LARGE (≥64px wide — was 18px)
  const logo = dialog.locator('.welcome-logo svg');
  const logoBox = (await logo.boundingBox())!;
  expect(logoBox.width, 'hero logo width').toBeGreaterThanOrEqual(64);

  // 2) the two action buttons are centered within the dialog
  const dialogBox = (await dialog.boundingBox())!;
  const openBtn = dialog.getByRole('button', { name: /open/i }).first();
  const openBox = (await openBtn.boundingBox())!;
  const btnCenter = openBox.x + openBox.width / 2;
  const dialogCenter = dialogBox.x + dialogBox.width / 2;
  expect(Math.abs(btnCenter - dialogCenter), 'buttons centered').toBeLessThan(dialogBox.width * 0.18);

  // 3) the inspired-by credit is removed from the dialog
  await expect(dialog).not.toContainText(/inspired by audiomass/i);

  // 4) developer credit card — professional placement at the bottom
  const card = dialog.locator('.welcome-dev');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Mir Md. Masum');
  await expect(card).toContainText(/developer/i);
  const mail = card.locator('a[href^="mailto:mirmasum@mail.com"]');
  await expect(mail).toBeVisible();
  const insta = card.locator('a[href*="instagram.com/mirmd_masum"]');
  await expect(insta).toBeVisible();
  await expect(card).toContainText(/discord\s*·\s*mir_masum/i);

  // avatar: either the profile image or the monogram fallback renders
  const avatar = dialog.locator('.dev-avatar');
  await expect(avatar.first()).toBeVisible();

  // 5) keyboard: the email link is focusable (tab order reaches the card)
  await mail.focus();
  await expect(mail).toBeFocused();
});
