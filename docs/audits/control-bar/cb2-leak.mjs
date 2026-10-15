import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 320, height: 800 } })).newPage();
await page.goto('http://localhost:5175/?cbv2=1', { waitUntil: 'domcontentloaded' });
const wl = page.getByRole('dialog', { name: /welcome/i });
await wl.getByRole('button', { name: /load sample/i }).click();
await page.getByText('demo.wav', { exact: true }).waitFor({ timeout: 20000 });
await page.waitForTimeout(400);
const leaks = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const b = el.getBoundingClientRect();
    if (b.right > 322 && b.width > 0) {
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(b.right)} w=${Math.round(b.width)}`);
    }
  }
  return out.slice(0, 24);
});
console.log(leaks.join('\n'));
await browser.close();
