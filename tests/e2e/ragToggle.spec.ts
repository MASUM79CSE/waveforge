import { expect, test } from '@playwright/test';

/**
 * Post-release rollout toggle (§6 step b): View → Smart transcript
 * features (beta) — always visible, works with the flag OFF, flips
 * localStorage['wf.rag'] and reloads. Default stays OFF.
 */

async function openViewMenu(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

async function dismissMenu(page: import('@playwright/test').Page) {
  await page.getByRole('main').click({ position: { x: 10, y: 10 } });
  await expect(page.getByRole('menu')).toHaveCount(0);
}

async function passWelcome(page: import('@playwright/test').Page) {
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /get started|load sample/i }).click();
  await expect(welcome).toHaveCount(0);
}

test('ragToggle: opt-in from the View menu without URL params', async ({ page }) => {
  await page.goto('/');
  await passWelcome(page);

  // flag OFF: no Transcription group; the toggle IS visible and unchecked
  await openViewMenu(page);
  const toggle = page.getByRole('menuitem', { name: /smart transcript features/i });
  await expect(toggle).toBeVisible();
  expect(await toggle.locator('.menu-check').textContent()).toBe('');
  await expect(page.getByRole('menuitem', { name: /^Transcript\b/i })).toHaveCount(0);
  await dismissMenu(page);

  // opt in → the app reloads itself → the group appears, check set
  await openViewMenu(page);
  await page.getByRole('menuitem', { name: /smart transcript features/i }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => (window as unknown as { __wfRagTest?: unknown }).__wfRagTest !== undefined,
    undefined,
    { timeout: 15_000 },
  );
  await passWelcome(page);
  await openViewMenu(page);
  await expect(page.getByRole('menuitem', { name: /^Transcript\b/i })).toBeVisible();
  const toggle2 = page.getByRole('menuitem', { name: /smart transcript features/i });
  await expect(toggle2.locator('.menu-check')).toHaveText('✔');
  await dismissMenu(page);

  // the panel genuinely works now (Ctrl+Shift+F opens it)
  await page.keyboard.press('Control+Shift+F');
  const panel = page.getByRole('complementary', { name: /transcript/i });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: /^close/i }).click();
  await expect(panel).toHaveCount(0);

  // opt back out → reload → group gone again, toggle unchecked
  await openViewMenu(page);
  await page.getByRole('menuitem', { name: /smart transcript features/i }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => (window as unknown as { __wfBooted?: boolean }) !== null);
  await passWelcome(page);
  await openViewMenu(page);
  await expect(page.getByRole('menuitem', { name: /^Transcript\b/i })).toHaveCount(0);
  const toggle3 = page.getByRole('menuitem', { name: /smart transcript features/i });
  await expect(toggle3).toBeVisible();
  expect(await toggle3.locator('.menu-check').textContent()).toBe('');
});
