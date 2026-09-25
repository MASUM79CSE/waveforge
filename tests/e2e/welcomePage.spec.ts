import { expect, test } from '@playwright/test';

// The removed external-reference name must never appear in the UI.
// Built by concatenation so the forbidden literal itself stays out of the repo.
const FORBIDDEN = new RegExp(['audio', 'mass'].join(''), 'i');

/**
 * e2e #58 — welcome + about developer credit (corrected split):
 * WELCOME = large hero logo, centered actions, NO inspired-by, SIMPLE
 * one-line developer credit (name only, mailto). ABOUT = NO inspired-by,
 * FULL professional developer card (avatar with monogram fallback, name,
 * role, email, Instagram, Discord).
 */

async function openWelcome(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: /welcome/i })).toBeVisible();
}

test('welcome: large logo, centered actions, simple dev credit, no inspired-by', async ({ page }) => {
  await openWelcome(page);
  const dialog = page.getByRole('dialog', { name: /welcome/i });

  // hero logo is LARGE (≥64px — was 18px)
  const logoBox = (await dialog.locator('.welcome-logo svg').boundingBox())!;
  expect(logoBox.width, 'hero logo width').toBeGreaterThanOrEqual(64);

  // the two action buttons are centered within the dialog
  const dialogBox = (await dialog.boundingBox())!;
  const openBox = (await dialog.getByRole('button', { name: /open/i }).first().boundingBox())!;
  const btnCenter = openBox.x + openBox.width / 2;
  const dialogCenter = dialogBox.x + dialogBox.width / 2;
  expect(Math.abs(btnCenter - dialogCenter), 'buttons centered').toBeLessThan(dialogBox.width * 0.18);

  // no reference-name credit anywhere in the dialog
  await expect(dialog).not.toContainText(FORBIDDEN);

  // SIMPLE developer credit: one line, name → mailto — no heavy card
  const line = dialog.locator('.welcome-dev-line');
  await expect(line).toBeVisible();
  await expect(line).toContainText(/developed by/i);
  await expect(line.getByRole('link', { name: 'Mir Md. Masum' })).toHaveAttribute(
    'href',
    'mailto:mirmasum@mail.com',
  );
  await expect(dialog.locator('.welcome-dev')).toHaveCount(0);
  await expect(dialog.locator('.dev-avatar')).toHaveCount(0);
});

test('about: no reference attribution, full professional developer card', async ({ page }) => {
  await openWelcome(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: /about/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // attribution removed from the About dialog too
  await expect(dialog).not.toContainText(FORBIDDEN);

  // full developer card: avatar + name + professional title + note + contacts
  const card = dialog.locator('.welcome-dev');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Mir Md. Masum');
  await expect(card).toContainText(/full-stack software engineer/i);
  await expect(card).toContainText(/system architect/i);
  await expect(card).toContainText(/audio engineer/i);
  await expect(card.locator('.dev-note')).toContainText(/designed, architected & developed from scratch/i);
  await expect(card.locator('a[href^="mailto:mirmasum@mail.com"]')).toBeVisible();
  await expect(card.locator('a[href*="instagram.com/mirmd_masum"]')).toBeVisible();
  await expect(card).toContainText(/discord\s*·\s*mir_masum/i);
  await expect(dialog.locator('.dev-avatar').first()).toBeVisible();

  // keyboard reachability: email link focuses
  const mail = card.locator('a[href^="mailto:mirmasum@mail.com"]');
  await mail.focus();
  await expect(mail).toBeFocused();
});
