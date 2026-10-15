import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
// 1) page h-scroll probe at narrow widths, flag ON
for (const w of [1280, 390, 320]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: 800 } })).newPage();
  await page.goto(`http://localhost:5175/?cbv2=1`, { waitUntil: 'domcontentloaded' });
  const wl = page.getByRole('dialog', { name: /welcome/i });
  await wl.getByRole('button', { name: /load sample/i }).click();
  await page.getByText('demo.wav', { exact: true }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
    bodyHScroll: document.documentElement.scrollWidth > window.innerWidth,
  }));
  console.log(`w=${w}: doc=${r.doc} win=${r.win} pageHScroll=${r.bodyHScroll}`);
  await page.context().close();
}
// 2) guarded localStorage flag path (no URL param)
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.addInitScript(() => localStorage.setItem('ui.controlBarV2', '1'));
await page.goto('http://localhost:5175/', { waitUntil: 'domcontentloaded' });
const wl = page.getByRole('dialog', { name: /welcome/i });
await wl.getByRole('button', { name: /load sample/i }).click();
await page.getByText('demo.wav', { exact: true }).waitFor({ timeout: 20000 });
console.log('localStorage=1 → cb2 present:', await page.getByTestId('cb2-root').count());
const p2 = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await p2.addInitScript(() => localStorage.setItem('ui.controlBarV2', '0'));
await p2.goto('http://localhost:5175/', { waitUntil: 'domcontentloaded' });
const wl2 = p2.getByRole('dialog', { name: /welcome/i });
await wl2.getByRole('button', { name: /load sample/i }).click();
await p2.getByText('demo.wav', { exact: true }).waitFor({ timeout: 20000 });
console.log('localStorage=0 → v1 transport present:', await p2.locator('.transport').count(), '| cb2:', await p2.getByTestId('cb2-root').count());
await browser.close();
