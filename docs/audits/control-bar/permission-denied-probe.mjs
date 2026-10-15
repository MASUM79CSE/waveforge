/**
 * CB-0.4 supplemental: microphone-permission-DENIED behavior probe (H-09).
 * Headless Chromium auto-denies getUserMedia prompts when the fake-UI flag is
 * absent — we launch WITHOUT --use-fake-ui-for-media-stream (but keep the fake
 * device so the only variable is the permission decision) and observe what the
 * record control actually does: toast text, button state, zone geometry,
 * recovery on retry. Read-only measurement; no app code changed.
 *
 * Usage: node docs/audits/control-bar/permission-denied-probe.mjs <baseUrl> <outJson>
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = process.argv[2] ?? 'http://localhost:5180';
const OUT = process.argv[3] ?? 'docs/audits/control-bar/baseline/permission-denied.json';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  // NOTE: intentionally NO --use-fake-ui-for-media-stream → headless denies the mic prompt.
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => localStorage.setItem('waveforge.theme', 'dark'));
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 160)));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
const welcome = page.getByRole('dialog', { name: /welcome/i });
await welcome.getByRole('button', { name: /load sample/i }).click();
await page.getByText('demo.wav', { exact: true }).waitFor({ timeout: 20_000 });
await page.waitForTimeout(600);

// Ground truth: what does getUserMedia itself reject with in this context?
const gumError = await page.evaluate(async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    return 'GRANTED (probe setup wrong)';
  } catch (e) {
    return `${e.name}: ${String(e.message).slice(0, 80)}`;
  }
});

const recBtn = page.getByTestId('record-toggle');
const snap = () =>
  page.evaluate(() => {
    const btn = document.querySelector('[data-testid="record-toggle"]');
    const zone = btn?.closest('.tz, [class*=zone]') ?? btn?.parentElement;
    const z = zone?.getBoundingClientRect();
    const round = (x) => Math.round(x * 1000) / 1000;
    return {
      title: btn?.getAttribute('title'),
      ariaPressed: btn?.getAttribute('aria-pressed'),
      cls: String(btn?.className ?? ''),
      meterVisible: !!document.querySelector('.rec-meter-hold'),
      recTimeVisible: !!document.querySelector('.rec-time'),
      lastToast: document.querySelector('.toast:last-child')?.textContent?.trim() ?? null,
      toastCount: document.querySelectorAll('.toast').length,
      zoneW: z ? round(z.width) : null,
      liveRegion: document.querySelector('.toasts')?.getAttribute('aria-live') ?? null,
      liveRole: document.querySelector('.toasts')?.getAttribute('role') ?? null,
    };
  });

const before = await snap();
await recBtn.click();
await page.waitForTimeout(1_500);
const afterDeny1 = await snap();
await recBtn.click(); // recovery attempt — second arm
await page.waitForTimeout(1_500);
const afterDeny2 = await snap();

const out = {
  generated: new Date().toISOString(),
  commit: execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(),
  gumError,
  liveRegion: { role: before.liveRegion, ariaLive: before.liveRegion },
  before,
  afterDeny1,
  afterDeny2,
  consoleErrors: consoleErrors.slice(0, 8),
};
await browser.close();
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
