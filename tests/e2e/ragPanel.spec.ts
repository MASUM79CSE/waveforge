import { expect, test, type Page } from '@playwright/test';

const RULE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
  return page.evaluate(async (tags) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = (window as any).axe;
    const results = await a.run(document, { runOnly: { type: 'tag', values: tags } });
    return results.violations.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (v: any) => `${v.impact} ${v.id}: ${v.help}`,
    );
  }, RULE_TAGS);
}

test('ragPanel: flag OFF — View menu has no Transcription group', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('dialog', { name: /welcome/i }).getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'View', exact: true }).click();
  const items = page.getByRole('menuitem');
  const texts = await items.allTextContents();
  // no RAG feature items when the flag is OFF (the opt-in/out toggle is
  // deliberately always visible — rollout §6 step b)
  expect(texts.join('|')).not.toMatch(/manage ai models|export transcript|smart deletion|silence selection/i);
  expect(texts.join('|')).not.toMatch(/(^|\|)Transcript/i); // no panel item / group header
  const toggle = page.getByRole('menuitem', { name: /smart transcript features/i });
  await expect(toggle).toBeVisible();
  expect(await toggle.locator('.menu-check').textContent()).toBe('');
  await page.keyboard.press('Escape');
  // shortcut does nothing visible either
  await page.keyboard.press('Control+Shift+F');
  await expect(page.getByRole('complementary', { name: /transcript/i })).toHaveCount(0);
});

test('ragPanel: flag ON — menu opens panel, axe-clean, Escape closes', async ({ page }) => {
  await page.goto('/?rag=1');
  await page.getByRole('dialog', { name: /welcome/i }).getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Transcript/i }).click();

  const panel = page.getByRole('complementary', { name: /transcript/i });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/not set up/i);
  expect(await axeViolations(page)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('ragPanel: Ctrl+Shift+F toggles; Manage models opens the manage dialog', async ({ page }) => {
  await page.goto('/?rag=1');
  await page.getByRole('dialog', { name: /welcome/i }).getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press('Control+Shift+F');
  const panel = page.getByRole('complementary', { name: /transcript/i });
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: /manage ai models/i }).click();
  await expect(page.getByRole('dialog', { name: /manage ai models/i })).toBeVisible();
  // Escape closes the dialog first (chain), then the panel
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /manage ai models/i })).toHaveCount(0);
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});
