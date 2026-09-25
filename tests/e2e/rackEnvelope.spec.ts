import { expect, test, type Page } from '@playwright/test';

/**
 * 42nd e2e (C5 — docs/fxchains-plan.md): author a per-entry param envelope
 * in the FX Rack (∿ toggle → click points on the entry-scoped editor),
 * apply — the curve bakes into that stage's render — undo, redo. Zero
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

test('rack entry envelope: author tremolo depth curve, apply, undo, redo (C5)', async ({
  page,
}) => {
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

  // add Tremolo (new entries auto-expand their param rows)
  await panel.locator('#rack-add-select').selectOption('fx.tremolo');
  await panel.getByTestId('rack-add').click();
  await expect(panel.getByTestId('rack-row-0').locator('.rack-params')).toBeVisible();

  // arm the entry-scoped depth envelope — the editor mounts with 0 points
  const arm = panel
    .getByTestId('rack-row-0')
    .getByRole('button', { name: /Depth Envelope/i });
  await arm.click();
  const editor = panel.locator('[data-testid="fx-envelope-0:depth"]');
  await expect(editor).toBeVisible();
  await expect(editor.locator('[data-testid="fx-env-count-0:depth"]')).toHaveText('0');

  // draw two points on the envelope canvas
  const canvas = editor.locator('canvas.fx-envelope-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.3, box!.y + box!.height * 0.7);
  await page.mouse.click(box!.x + box!.width * 0.7, box!.y + box!.height * 0.2);
  await expect(editor.locator('[data-testid="fx-env-count-0:depth"]')).toHaveText('2');

  // offline preview with the curve, then apply — one history entry
  await panel.getByRole('button', { name: /Preview/i }).first().click();
  await panel.getByRole('button', { name: /Stop preview/i }).click();
  await panel.getByTestId('rack-apply').click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied.*FX Rack/i, {
    timeout: 20_000,
  });
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('.toast-msg').last()).toContainText(/Redid/i, { timeout: 8000 });

  expect(consoleErrors).toEqual([]);
});
