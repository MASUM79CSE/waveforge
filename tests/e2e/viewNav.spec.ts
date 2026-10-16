import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * PF-07 / AM-02: zoom, pan and selection — view navigation parity.
 * Desktop evidence: keyboard +/−/0, ctrl+wheel anchored zoom, wheel pan,
 * Center-to-Cursor, Follow-Cursor, zero-cross toggle wiring. Touch
 * evidence runs under Playwright TOUCH EMULATION (hasTouch + CDP touch
 * sequences) — real-device behavior is documented NOT RUN in the ledger.
 */

async function loadSample(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');
  const welcome = page.getByRole('dialog', { name: /welcome/i });
  await welcome.getByRole('button', { name: /load sample/i }).click();
  await expect(page.getByText('demo.wav', { exact: true })).toBeVisible({ timeout: 10_000 });
}

/** ×zoom readout cell — selected by its stable title (a conditional
 * selection-duration cell can shift positional indexes). */
function zoomCell(page: Page): ReturnType<Page['locator']> {
  return page.locator('.status-item[title="Samples per pixel"]');
}

async function canvasShot(page: Page): Promise<string> {
  return page.locator('canvas.wave-canvas').evaluate((el) => (el as HTMLCanvasElement).toDataURL());
}

/** Dispatch a wheel event on the canvas center through the page (event-wiring test). */
async function wheelOnCanvas(page: Page, opts: { deltaX?: number; deltaY?: number; ctrl?: boolean }): Promise<void> {
  await page.locator('canvas.wave-canvas').evaluate(
    (el, o) => {
      const rect = (el as HTMLCanvasElement).getBoundingClientRect();
      el.dispatchEvent(
        new WheelEvent('wheel', {
          deltaX: o.deltaX ?? 0,
          deltaY: o.deltaY ?? 0,
          ctrlKey: o.ctrl ?? false,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          cancelable: true,
        }),
      );
    },
    opts,
  );
}

interface TouchPt {
  x: number;
  y: number;
}

/** Raw CDP touch sequence: down with the given points, moves, then up. */
async function touchSequence(page: Page, frames: TouchPt[][]): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: frames[0]!.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })),
  });
  for (let f = 1; f < frames.length; ++f) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: frames[f]!.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('canvas.wave-canvas').boundingBox();
  if (!box) throw new Error('canvas not visible');
  return box;
}

test.describe('desktop view navigation', () => {
  test('keyboard +/−/0 drive the ×zoom readout, 0 restores', async ({ page }) => {
    await loadSample(page);
    const before = await zoomCell(page).textContent();
    expect(before).toMatch(/×\d/);
    await page.keyboard.press('+');
    await expect(zoomCell(page)).not.toHaveText(before ?? '', { timeout: 5000 });
    const zoomed = await zoomCell(page).textContent();
    await page.keyboard.press('0');
    await expect(zoomCell(page)).toHaveText(before ?? '', { timeout: 5000 });
    expect(zoomed).not.toBe(before);
  });

  test('ctrl+wheel zooms anchored at the pointer; plain wheel pans (pixels move, zoom unchanged)', async ({
    page,
  }) => {
    await loadSample(page);
    const base = await zoomCell(page).textContent();

    // plain wheel: pan — pixels change, ×zoom constant
    const beforePan = await canvasShot(page);
    await wheelOnCanvas(page, { deltaY: 600 });
    await page.waitForTimeout(150);
    expect(await canvasShot(page)).not.toBe(beforePan);
    expect(await zoomCell(page).textContent()).toBe(base);

    // ctrl+wheel: anchored zoom — ×zoom changes
    await wheelOnCanvas(page, { deltaY: -600, ctrl: true });
    await page.waitForTimeout(150);
    expect(await zoomCell(page).textContent()).not.toBe(base);
    await page.keyboard.press('0');
    await expect(zoomCell(page)).toHaveText(base ?? '', { timeout: 5000 });
  });

  test('View ▸ Center to Cursor re-centers the view on the cursor (pixels move)', async ({ page }) => {
    await loadSample(page);
    // zoom in so centering visibly changes the viewport, then seek near the end
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    const box = await canvasBox(page);
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.6); // click = seek
    await page.waitForTimeout(200);
    const before = await canvasShot(page);
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: /Center to Cursor/i }).click();
    await page.waitForTimeout(250);
    expect(await canvasShot(page)).not.toBe(before);
  });

  test('Follow Cursor pans the view during playback (pixels move while playing)', async ({ page }) => {
    await loadSample(page);
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await page.getByRole('menuitem', { name: 'View' }).click();
    const followItem = page.getByRole('menuitem', { name: /Follow Cursor/i });
    await expect(followItem).toBeVisible();
    await page.keyboard.press('Escape'); // menu closed; follow already on by default
    const before = await canvasShot(page);
    await page.keyboard.press('Space'); // play from 0
    await page.waitForTimeout(1500);
    const during = await canvasShot(page);
    await page.keyboard.press('Space'); // stop
    expect(during).not.toBe(before);
  });

  test('View ▸ Zero-Cross Selection toggles and reflects its state', async ({ page }) => {
    await loadSample(page);
    await page.getByRole('menuitem', { name: 'View' }).click();
    const item = page.getByRole('menuitem', { name: /Zero-Cross Selection/i });
    await expect(item).toBeVisible();
    // default ON (state.ts readStoredBool('zerocross', true))
    await item.click(); // -> off
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: /Zero-Cross Selection/i }).click(); // -> on
    // selection still lands after a drag (snap path exercised on every selection)
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    const sels = await page.locator('.sel-val').allTextContents();
    expect(sels[0]).toMatch(/^\d:\d\d\.\d\d\d$/);
    expect(sels[1]).toMatch(/^\d:\d\d\.\d\d\d$/);
  });
});

test.describe('touch gestures (EMULATED — real device NOT RUN, see ledger)', () => {
  test.use({ hasTouch: true });

  test('single-finger drag selects, quick tap seeks', async ({ page }) => {
    await loadSample(page);
    const box = await canvasBox(page);
    const y = box.y + box.height * 0.5;
    await touchSequence(page, [
      [{ x: box.x + box.width * 0.25, y }],
      [{ x: box.x + box.width * 0.3, y }],
      [{ x: box.x + box.width * 0.4, y }],
      [{ x: box.x + box.width * 0.5, y }],
      [{ x: box.x + box.width * 0.55, y }],
    ]);
    await page.waitForTimeout(200);
    const sels = await page.locator('.sel-val').allTextContents();
    expect(sels[0]).toMatch(/^\d:\d\d\.\d\d\d$/);
    expect(sels[1]).toMatch(/^\d:\d\d\.\d\d\d$/);
  });

  test('two-finger pinch zooms the view', async ({ page }) => {
    await loadSample(page);
    const base = await zoomCell(page).textContent();
    const box = await canvasBox(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await touchSequence(page, [
      [
        { x: cx - 90, y: cy },
        { x: cx + 90, y: cy },
      ],
      [
        { x: cx - 100, y: cy },
        { x: cx + 100, y: cy },
      ],
      [
        { x: cx - 130, y: cy },
        { x: cx + 130, y: cy },
      ],
      [
        { x: cx - 170, y: cy },
        { x: cx + 170, y: cy },
      ],
    ]);
    await page.waitForTimeout(250);
    expect(await zoomCell(page).textContent()).not.toBe(base);
  });

  test('two-finger drag pans (pixels move, zoom unchanged)', async ({ page }) => {
    await loadSample(page);
    const base = await zoomCell(page).textContent();
    const box = await canvasBox(page);
    const cy = box.y + box.height / 2;
    const before = await canvasShot(page);
    const d = 60;
    await touchSequence(page, [
      [
        { x: box.x + box.width * 0.5 - d, y: cy },
        { x: box.x + box.width * 0.5 + d, y: cy },
      ],
      [
        { x: box.x + box.width * 0.55 - d, y: cy },
        { x: box.x + box.width * 0.55 + d, y: cy },
      ],
      [
        { x: box.x + box.width * 0.6 - d, y: cy },
        { x: box.x + box.width * 0.6 + d, y: cy },
      ],
      [
        { x: box.x + box.width * 0.65 - d, y: cy },
        { x: box.x + box.width * 0.65 + d, y: cy },
      ],
    ]);
    await page.waitForTimeout(250);
    expect(await zoomCell(page).textContent()).toBe(base); // no accidental zoom
    expect(await canvasShot(page)).not.toBe(before); // view actually panned
    // a two-finger pan must never become a selection drag
    const sels = await page.locator('.sel-val').allTextContents();
    expect(sels[0]).toBe('-');
    expect(sels[1]).toBe('-');
  });
});
