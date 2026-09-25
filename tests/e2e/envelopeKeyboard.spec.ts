import { expect, test, type Page } from '@playwright/test';

/**
 * 44th e2e (X3 — docs/quality-plan.md): the envelope editor is keyboard-
 * operable (WCAG 2.1.1). Tab reaches the canvas, Enter adds the first
 * point, arrows nudge it, Enter inserts a neighbour, Delete removes —
 * counts asserted through the same testids the pointer flow uses. Zero
 * console errors.
 */

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

test('envelope editor: keyboard authoring (X3)', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    // the developer-avatar CDN (pbs.twimg.com) is blocked in sandboxed CI;
        // real deployments load it — ignore that one external line
        if (
          m.type() === 'error' &&
          !m.location()?.url.includes('pbs.twimg.com')
        )
          consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await loadSample(page);

  await page.keyboard.press('Shift+a');
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /FX Rack/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();

  // add Tremolo (auto-expands), arm the depth envelope
  await panel.locator('#rack-add-select').selectOption('fx.tremolo');
  await panel.getByTestId('rack-add').click();
  const arm = panel
    .getByTestId('rack-row-0')
    .getByRole('button', { name: /Depth Envelope/i });
  await arm.click();
  const editor = panel.locator('[data-testid="fx-envelope-0:depth"]');
  const count = editor.locator('[data-testid="fx-env-count-0:depth"]');
  await expect(count).toHaveText('0');

  // Tab from the ∿ button until the canvas holds focus (keyboard-only reach)
  const canvas = editor.locator('canvas.fx-envelope-canvas');
  let focused = false;
  for (let i = 0; i < 8 && !focused; ++i) {
    await page.keyboard.press('Tab');
    focused = await canvas.evaluate((el) => el === document.activeElement);
  }
  expect(focused).toBe(true);

  // Enter on an empty editor → first point at the region midpoint
  await page.keyboard.press('Enter');
  await expect(count).toHaveText('1');

  // arrows nudge the selected point (no point count change)
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await expect(count).toHaveText('1');

  // Enter inserts a neighbour; Delete removes it
  await page.keyboard.press('Enter');
  await expect(count).toHaveText('2');
  await page.keyboard.press('Delete');
  await expect(count).toHaveText('1');

  // Escape deselects; the curve stays
  await page.keyboard.press('Escape');
  await expect(count).toHaveText('1');

  expect(consoleErrors).toEqual([]);
});
