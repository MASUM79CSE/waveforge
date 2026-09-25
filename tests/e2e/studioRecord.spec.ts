import { expect, test } from '@playwright/test';

/**
 * e2e #50 — R-series studio record flow: arm (mic opens, meter lives,
 * nothing rolls) → roll → stop → take lands; takes list; monitor +
 * metronome toggles persist (docs/recording-plan.md R1–R3).
 */
test('studio record: arm → meter → roll → take → takes list', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /skip|close|✕/i }).first().click().catch(() => {});

  const record = page.getByTestId('record-toggle');

  // 1) ARM: fake mic opens, meter becomes live, but nothing is rolling
  await record.click();
  await expect(page.locator('.rec-meter')).toBeVisible({ timeout: 5_000 });
  await expect(record).toHaveClass(/armed/);
  await expect(page.locator('.rec-time')).toHaveCount(0); // clock hidden while armed

  // 2) MONITOR toggle (armed): warning + active state
  const monitor = page.getByTestId('monitor-toggle');
  await monitor.click();
  await expect(page.getByText(/input monitoring on/i)).toBeVisible();

  // 3) ROLL: second press starts the clock (metronome off → no count-in)
  await record.click();
  await expect(page.locator('.rec-time')).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(2_000);

  // 4) STOP: take installs as the active document
  await record.click();
  await expect(page.getByText(/recording 1/i).first()).toBeVisible({ timeout: 10_000 });

  // 5) takes list in the record settings dialog (via the File menu)
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /record from microphone/i }).click();
  await expect(page.getByTestId('takes-list')).toBeVisible();
  await expect(page.locator('.take-chip').first()).toHaveText(/take 1/i);
  await page.getByRole('button', { name: /save & close/i }).click();

  // 6) metronome toggle via M + persistence across reload
  await page.keyboard.press('m');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /record from microphone/i }).click();
  await expect(page.getByTestId('metronome-toggle')).toBeChecked();
  await page.getByRole('button', { name: /save & close/i }).click();
  await page.reload();
  await page.getByRole('button', { name: /skip|close|✕/i }).first().click().catch(() => {});
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /record from microphone/i }).click();
  await expect(page.getByTestId('metronome-toggle')).toBeChecked();
});

/**
 * e2e #51 — punch in/out: selection + monitoring → punch records between
 * the selection edges and lands as ONE undoable edit (non-destructive:
 * undo restores the original audio, redo re-applies the punch).
 */
test('punch in/out over a selection — one undoable edit', async ({ page }) => {
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });

  // select a short region (10%..15% of the timeline)
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  // monitoring must be on for punch (studio safety)
  await page.getByTestId('monitor-toggle').click();
  await expect(page.getByText(/input monitoring on/i)).toBeVisible();

  const punch = page.getByTestId('punch-button');
  await expect(punch).toBeEnabled();
  await punch.click(); // auto-arms (fake mic) → count-in off → pre-roll → roll

  await expect(page.getByText(/punch recorded/i)).toBeVisible({ timeout: 15_000 });

  // the punch is ONE history entry: undo restores, redo re-applies
  await page.keyboard.press('Control+z');
  await expect(page.getByText(/undid/i).first()).toBeVisible({ timeout: 5_000 });
  await page.keyboard.press('Control+y');
  await expect(page.getByText(/redid|redo/i).first()).toBeVisible({ timeout: 5_000 });
});
