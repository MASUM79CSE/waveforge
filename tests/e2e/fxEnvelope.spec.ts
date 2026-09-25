import { expect, test, type Page } from '@playwright/test';

/**
 * 38th e2e (A7 — docs/automation-plan.md A7 addendum): author an FX param
 * envelope in the effect dialog (∿ toggle → click points on the envelope
 * canvas), apply, undo, redo — the curves ride preview/apply through
 * EffectRunContext.paramCurves and bake into the audio. Zero console errors.
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

test('fx envelope: author tremolo depth curve, apply, undo, redo (A7)', async ({ page }) => {
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

  // select all so the effect targets a region
  await page.keyboard.press('Shift+a');
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /Tremolo/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();

  // arm the depth param's envelope — the editor canvas mounts
  await panel.getByRole('button', { name: /Depth Envelope/i }).click();
  const editor = panel.locator('[data-testid="fx-envelope-depth"]');
  await expect(editor).toBeVisible();
  await expect(editor.locator('[data-testid="fx-env-count-depth"]')).toHaveText('0');

  // draw two points on the envelope canvas
  const canvas = editor.locator('canvas.fx-envelope-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.3, box!.y + box!.height * 0.7);
  await page.mouse.click(box!.x + box!.width * 0.7, box!.y + box!.height * 0.2);
  await expect(editor.locator('[data-testid="fx-env-count-depth"]')).toHaveText('2');

  // preview start must not throw with curves present (kernel path bakes them)
  await panel.getByRole('button', { name: /Preview/i }).first().click();
  await panel.getByRole('button', { name: /Stop preview/i }).click();

  // apply → toast; undo/redo ride the standard edit history
  await panel.getByRole('button', { name: /^Apply$/ }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied/i, { timeout: 15_000 });
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('.toast-msg').last()).toContainText(/Redid/i, { timeout: 8000 });

  expect(consoleErrors).toEqual([]);
});
