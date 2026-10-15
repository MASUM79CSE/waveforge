import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
for (let i = 0; i < 4; i++) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto('http://localhost:5179', { waitUntil: 'domcontentloaded' });
  const w = page.getByRole('dialog', { name: /welcome/i });
  await w.getByRole('button', { name: /load sample/i }).click();
  await page.getByText('demo.wav', { exact: true }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  await page.keyboard.press('b');
  const d1 = page.getByRole('dialog', { name: /add marker/i });
  await d1.locator('#text-prompt-value').waitFor();
  await d1.locator('#text-prompt-value').fill('chorus');
  await d1.getByRole('button', { name: /apply/i }).click();
  await page.locator('.toast-msg').last().waitFor({ timeout: 8000 });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename Marker' }).click();
  const d2 = page.getByRole('dialog', { name: /rename marker/i });
  await d2.locator('#text-prompt-value').waitFor();
  const counts = await page.evaluate(() => ({
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    inputs: document.querySelectorAll('#text-prompt-value').length,
  }));
  await d2.locator('#text-prompt-value').fill('bridge');
  await page.waitForTimeout(120); // let any re-render settle, as a slow click would
  const after = await page.evaluate(() => document.querySelector('#text-prompt-value')?.value);
  await d2.getByRole('button', { name: /apply/i }).click();
  await page.waitForTimeout(400);
  const t2 = (await page.locator('.toast-msg').last().textContent())?.trim();
  console.log(`round ${i + 1}: dialogs=${counts.dialogs} inputs=${counts.inputs} valueAfterSettle="${after}" toast="${t2}"`);
  await page.context().close();
}
await browser.close();
