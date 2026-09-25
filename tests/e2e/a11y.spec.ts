import { expect, test, type Page } from '@playwright/test';

/**
 * 43rd e2e (X2 — docs/quality-plan.md): the permanent axe-core gate.
 * wcag2a + wcag2aa, zero violations of ANY impact, over the real app in
 * four live states: main editor, welcome dialog, a Compressor effect
 * dialog (ParamRow + quick-preset), and a populated FX Rack (rows + the
 * envelope editor). Findings live in docs/quality-analysis.md; X1 fixed
 * them — this file keeps them fixed.
 */

const RULE_TAGS = ['wcag2a', 'wcag2aa'];

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

async function loadSample(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

test('x2: axe zero violations — main editor page', async ({ page }) => {
  await loadSample(page);
  expect(await axeViolations(page)).toEqual([]);
});

test('x2: axe zero violations — welcome dialog', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: /welcome/i })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test('x2: axe zero violations — compressor effect dialog', async ({ page }) => {
  await loadSample(page);
  await page.keyboard.press('Shift+a');
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /Compressor/i }).click();
  await expect(page.getByRole('dialog', { name: /Compressor/i })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test('x2: axe zero violations — populated FX Rack with envelope editor', async ({ page }) => {
  await loadSample(page);
  await page.keyboard.press('Shift+a');
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /FX Rack/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await panel.locator('#rack-add-select').selectOption('fx.tremolo');
  await panel.getByTestId('rack-add').click();
  // entry auto-expands: arm the depth envelope so the canvas is live
  await panel.getByTestId('rack-row-0').getByRole('button', { name: /Depth Envelope/i }).click();
  await expect(panel.locator('[data-testid="fx-envelope-0:depth"]')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});
