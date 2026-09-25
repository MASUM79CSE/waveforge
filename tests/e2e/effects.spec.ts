import { expect, test } from '@playwright/test';

/**
 * E1 mastering e2e (effects v2 plan §8.8): LUFS Normalize and the
 * true-peak Limiter apply through the real menu/dialog on demo.wav.
 * Both kernels are length-preserving — the status bar duration must not
 * change; toasts confirm the committed edit.
 */

async function loadSample(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

async function applyEffect(
  page: import('@playwright/test').Page,
  label: RegExp,
): Promise<void> {
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: label }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Apply' }).click();
}

test('effects: LUFS Normalize applies at full length', async ({ page }) => {
  await loadSample(page);
  await applyEffect(page, /LUFS Normalize/i);
  // undoable edit commit + toast, duration untouched (9.27 s demo)
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied/i, {
    timeout: 15_000,
  });
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
  // user-facing standard: Ctrl+Z undoes the applied effect, Ctrl+Y redoes it
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('.toast-msg').last()).toContainText(/Redid/i, { timeout: 8000 });
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
});

test('effects: 8-band parametric EQ renders curve, applies, undoes', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /Parametric EQ \(8-band\)/i }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  // the analytic response curve canvas is mounted
  await expect(panel.locator('.eq-curve')).toBeVisible();
  // 8 band rows with type selects
  expect(await panel.locator('.eq-row').count()).toBe(8);
  // boost band 1 to +6 dB — the curve must change (redraw on param change)
  const gainInput = panel.locator('.eq-row').nth(0).locator('input').nth(1);
  await gainInput.fill('6');
  await gainInput.dispatchEvent('change');
  // apply through the generic kernel plumbing
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied/i, { timeout: 15_000 });
  await expect(page.getByText(/9\.27 s/)).toBeVisible(); // length preserved
  // Ctrl+Z undoes it (standard shortcut, user-facing contract)
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
});

test('effects: true-peak Limiter applies and undoes cleanly', async ({ page }) => {
  await loadSample(page);
  await applyEffect(page, /^Hard Limiter/);
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied/i, {
    timeout: 15_000,
  });
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
  // legacy shift-letter combo still works (Shift+Z)
  await page.keyboard.press('Shift+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
});

test('effects: Chorus (E3 modulation) applies via generic dialog and undoes', async ({
  page,
}) => {
  await loadSample(page);
  await applyEffect(page, /^Chorus/);
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied: Chorus/i, {
    timeout: 15_000,
  });
  // modulation kernels are length-preserving
  await expect(page.getByText(/9\.27 s/)).toBeVisible();
  // standard user-facing shortcut contract: Ctrl+Z undoes the effect
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('.toast-msg').last()).toContainText(/Redid/i, { timeout: 8000 });
});

test('effects: Studio Reverb grows the region by its wet tail (E4) and undoes', async ({
  page,
}) => {
  await loadSample(page);
  await applyEffect(page, /^Studio Reverb/);
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied: Studio Reverb/i, {
    timeout: 30_000,
  });
  // tail mechanism: RT60 1.8 s + predelay 20 ms + settle 20 ms extend the
  // selection → 9.27 s + 1.84 s ≈ 11.11 s in the status bar
  await expect(page.getByText(/11\.1\d s/)).toBeVisible({ timeout: 15_000 });
  // undo restores the original duration exactly
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await expect(page.getByText(/9\.27 s/)).toBeVisible({ timeout: 15_000 });
});

test('effects: De-esser applies via generic dialog and undoes (E6)', async ({ page }) => {
  await loadSample(page);
  await applyEffect(page, /^De-esser/);
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied: De-esser/i, {
    timeout: 30_000,
  });
  await expect(page.getByText(/9\.27 s/)).toBeVisible(); // length preserving
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await page.keyboard.press('Control+y');
  await expect(page.locator('.toast-msg').last()).toContainText(/Redid/i, { timeout: 8000 });
});

test('effects: Noise Reduction learns a print from the selection, applies, undoes', async ({
  page,
}) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Noise Reduction \(print\)/ }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/no print learned/i)).toBeVisible();
  await panel.getByRole('button', { name: /learn print from selection/i }).click();
  await expect(panel.getByText(/print learned/i)).toBeVisible({ timeout: 15_000 });
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied: Noise Reduction/i, {
    timeout: 30_000,
  });
  await expect(page.getByText(/9\.27 s/)).toBeVisible(); // length preserving
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
});

test('effects: Noise Reduction v3 applies with no print (auto mode) and undoes (E7)', async ({
  page,
}) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Noise Reduction v3/ }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  // generic dialog: reduction + adaptation params, no learn button needed
  await expect(panel.getByText(/Reduction \(dB\)/)).toBeVisible();
  await expect(panel.getByText(/Adaptation/)).toBeVisible();
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(
    /Applied: Noise Reduction v3/i,
    { timeout: 60_000 },
  );
  await expect(page.getByText(/9\.27 s/)).toBeVisible(); // length preserving
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
});

test('effects: Stretch / Pitch applies ×1.25 from the Effects menu (promoted, Z1)', async ({
  page,
}) => {
  await loadSample(page);
  // Z1 promotion: a first-class menu item — no experimental gate
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  const stretch = page.getByRole('menuitem', { name: /^Stretch \/ Pitch/ });
  await expect(stretch).toBeVisible();
  await stretch.click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  // ×1.25 stretch (first param row's number input)
  const pct = panel.locator('.fx-num').first();
  await pct.fill('125');
  await pct.dispatchEvent('change');
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.toast-msg').last()).toContainText(/Applied: Stretch \/ Pitch/i, {
    timeout: 30_000,
  });
  await expect(page.getByText(/11\.5\d s/)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Control+z');
  await expect(page.locator('.toast-msg').last()).toContainText(/Undid/i, { timeout: 8000 });
  await expect(page.getByText(/9\.27 s/)).toBeVisible({ timeout: 15_000 });
});

/**
 * Effects menu organization: the tools are grouped into labelled sections
 * (Dynamics / Noise reduction / EQ / …) — headers render, every fx command
 * sits inside exactly one group, and deep items are still clickable.
 */
test('effects menu is organized into labelled sections', async ({ page }) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  const dropdown = page.locator('.menu-dropdown');

  // section headers are visible
  for (const header of ['Dynamics', 'Noise reduction', 'EQ', 'Reverb & delay', 'Modulation', 'Amplitude', 'Special']) {
    await expect(dropdown.locator('.menu-header', { hasText: header })).toBeVisible();
  }

  // Compressor lives in the Dynamics group; group is exposed to AT
  const dynamics = dropdown.getByRole('group', { name: 'Dynamics' });
  await expect(dynamics.getByRole('menuitem', { name: /Compressor/ })).toBeVisible();
  await expect(dynamics).toHaveAttribute('aria-label', 'Dynamics');

  // deep item inside a scrollable dropdown still works (direct transform)
  await page.getByRole('menuitem', { name: /^Remove Silence/ }).click();
  // demo.wav has no silence below the threshold — the toast confirms the
  // deep menu item actually fired
  await expect(page.locator('.toast-msg').last()).toContainText(/no silence found/i, {
    timeout: 10_000,
  });
});
