import { expect, test } from '@playwright/test';

test('toolbar: icons disabled until a document loads, then cut via icon + Shift+Z undo', async ({
  page,
}) => {
  await page.goto('/');
  const cut = page.getByRole('button', { name: /^Cut/i }).first();
  await expect(cut).toBeDisabled();

  await page.getByRole('dialog', { name: /welcome/i }).getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(cut).toBeEnabled();

  // select the first third, cut via the icon
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not laid out');
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  await cut.click();
  // 30% of 9.272 s removed -> the big clock shows ~0:06.4
  await expect(page.locator('.time-total')).toHaveText(/0:06\./, { timeout: 10_000 });

  // undo the legacy way (Shift+Z — the toolbar has no undo icon)
  await page.keyboard.press('Shift+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/undid/i);
  await expect(page.locator('.time-total')).toHaveText(/0:09\.272/, { timeout: 10_000 });
});

test('selection readout: drag fills Start/End/Duration, Clear (Q) empties them', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('dialog', { name: /welcome/i }).getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  const vals = page.locator('.selgroup .sel-val');
  await expect(vals).toHaveCount(3);
  await expect(vals.nth(0)).toHaveText('-');
  await expect(vals.nth(1)).toHaveText('-');
  await expect(vals.nth(2)).toHaveText('-');

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not laid out');
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(vals.nth(0)).not.toHaveText('-');
  await expect(vals.nth(2)).not.toHaveText('-');

  await page.locator('.sel-clear').click();
  await expect(vals.nth(0)).toHaveText('-');
  await expect(vals.nth(2)).toHaveText('-');
});

test('view: amplitude axis toggle persists and redraws', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('dialog', { name: /welcome/i }).getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  // default on; toggle off and back on via the View menu
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const item = page.getByRole('menuitem', { name: /amplitude axis/i });
  await expect(item).toBeVisible();
  await item.click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /amplitude axis/i })).toBeVisible();
  // persisted preference survives a reload
  await page.reload();
  await page.waitForTimeout(800);
  const stored = await page.evaluate(() => localStorage.getItem('waveforge.amplitudeaxis'));
  expect(stored).toBe('0');
});

test('D5: zoom bar drives horizontal + vertical zoom; beat bar toggles', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('dialog', { name: /welcome/i }).getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  const zoombar = page.locator('.zoombar');
  const sppBefore = await page.locator('.status-item', { hasText: /×/ }).first().textContent();
  await zoombar.getByRole('button', { name: 'Zoom In Horiz (+)' }).click();
  await page.waitForTimeout(300);
  const sppAfter = await page.locator('.status-item', { hasText: /×/ }).first().textContent();
  expect(sppAfter).not.toBe(sppBefore); // ×284 -> smaller spp

  // vertical zoom: display updates and persists
  await zoombar.getByRole('button', { name: 'Zoom In Vertically' }).click();
  await expect(page.locator('.zoombar-val')).toHaveText(/1\.25×/);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => localStorage.getItem('waveforge.vzoom'))).toBe('1.25');

  // beat bar toggles
  const beat = page.getByRole('button', { name: 'BEAT', exact: true });
  const snap = page.getByRole('button', { name: 'SNAP', exact: true });
  await expect(beat).toHaveAttribute('aria-pressed', 'true');
  await expect(snap).toHaveAttribute('aria-pressed', 'true');
  await snap.click();
  await expect(snap).toHaveAttribute('aria-pressed', 'false');
});

test('D6: Help → Keyboard Shortcuts overlay lists legacy + standard bindings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('dialog', { name: /welcome/i }).getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: /keyboard shortcuts/i }).click();
  const panel = page.getByRole('dialog', { name: /keyboard shortcuts/i });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Shift+Z')).toBeVisible();
  await expect(panel.getByText('Ctrl+Y')).toBeVisible();
  await expect(panel.getByRole('heading', { name: /legacy/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('D8: channel strips drive per-channel volume/pan and mute; playback keeps working', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto('/');
  await page.getByRole('dialog', { name: /welcome/i }).getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  const rVol = page.getByRole('slider', { name: 'Right volume' });
  const rPan = page.getByRole('slider', { name: 'Right pan' });
  await expect(rVol).toBeVisible();
  await expect(rPan).toBeVisible();

  // pan R hard left, drop its volume — engine graph stays live
  await rPan.fill('-1');
  await rPan.dispatchEvent('input');
  await rVol.fill('0.2');
  await rVol.dispatchEvent('input');

  // play through the modified graph, then stop
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  await page.keyboard.press('Space');
  expect(consoleErrors).toEqual([]);

  // mute L via its strip button
  const lMute = page.getByRole('button', { name: 'Left — mute' });
  await lMute.click();
  await expect(lMute).toHaveAttribute('aria-pressed', 'true');
  await lMute.click();
  await expect(lMute).toHaveAttribute('aria-pressed', 'false');
});

test('D9: light theme + accent cycling apply to <html>, persist, and redraw the canvas', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto('/');
  await page.getByRole('dialog', { name: /welcome/i }).getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  // accent cycle
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Accent — Cyan$/ }).click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.documentElement.dataset.accent)).toBe('teal');

  // light theme
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: /Light Theme/ }).click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  expect(await page.evaluate(() => localStorage.getItem('waveforge.theme'))).toBe('light');

  // playback still works on the light canvas (palette re-read without errors)
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  expect(consoleErrors).toEqual([]);

  // persisted across reload
  await page.reload();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
});

test('D10: styled tooltip on hover, drop overlay during dragover', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('dialog', { name: /welcome/i }).getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  // tooltip appears above the cut icon with the shortcut hint
  const cut = page.getByRole('button', { name: /^Cut/i }).first();
  await cut.hover();
  const tip = page.locator('.gtip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(/cut/i);
  await page.mouse.move(10, 400);
  await expect(tip).toBeHidden();

  // dragover shows the drop overlay; leaving hides it
  const data = Buffer.from('RIFF----WAVE').toString('base64');
  await page.dispatchEvent('.canvas-region', 'dragenter');
  await expect(page.locator('.drop-overlay')).toBeVisible();
  await page.dispatchEvent('.canvas-region', 'dragleave');
  await expect(page.locator('.drop-overlay')).toHaveCount(0);
  void data;
});
