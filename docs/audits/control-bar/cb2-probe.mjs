import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.goto('http://localhost:4179/', { waitUntil: 'domcontentloaded' });
const wl = page.getByRole('dialog', { name: /welcome/i });
await wl.getByRole('button', { name: /load sample/i }).click();
await page.getByText('demo.wav', { exact: true }).waitFor({ timeout: 20000 });
console.log('default build (no flag anywhere) → cb2 count (expect 0):', await page.getByTestId('cb2-root').count(), '| v1 transport:', await page.locator('.transport').count());
await browser.close();
