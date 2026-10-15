import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let remounts = 0, toasts = [];
for (let round = 0; round < 6; round++) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('console', (m) => { const t = m.text(); if (t.startsWith('REMOUNT')) remounts++; });
  await page.goto('http://localhost:5180/', { waitUntil: 'domcontentloaded' });
  const w = page.getByRole('dialog', { name: /welcome/i });
  await w.getByRole('button', { name: /load sample/i }).click();
  await page.getByText('demo.wav', { exact: true }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('b');
  const d1 = page.getByRole('dialog', { name: /add marker/i });
  await d1.locator('#text-prompt-value').waitFor();
  await d1.locator('#text-prompt-value').fill('chorus');
  await d1.getByRole('button', { name: /apply/i }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename Marker' }).click();
  const d2 = page.getByRole('dialog', { name: /rename marker/i });
  await d2.locator('#text-prompt-value').waitFor();
  // track remounts of the input node
  await page.evaluate(() => {
    const inp = document.querySelector('#text-prompt-value');
    window.__inp = inp;
    window.__log2 = [];
    new MutationObserver(() => {
      const now = document.querySelector('#text-prompt-value');
      if (now !== window.__inp) {
        window.__log2.push('REMOUNT ' + performance.now().toFixed(0));
        window.__inp = now;
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  await d2.locator('#text-prompt-value').fill('bridge');
  const vAfterFill = await d2.locator('#text-prompt-value').inputValue();
  await d2.getByRole('button', { name: /apply/i }).click();
  await page.waitForTimeout(400);
  const toast = await page.locator('.toast-msg').last().textContent().catch(() => 'NONE');
  const valAtClick = await page.evaluate(() => window.__inp?.value ?? 'GONE');
  console.log(`round ${round + 1}: afterFill="${vAfterFill}" valAtClickNode="${valAtClick}" toast=${toast?.trim()}`);
  await page.context().close();
}
await browser.close();
