import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto('file:///home/user/moons/index.html');
await page.waitForFunction(() => typeof renderer !== 'undefined');
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/sim_t0.png' });

await page.click('text=Qaia-Primus');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/sim_qaia_t0.png' });

// set to 10 yr/s and let it run
const speedBtns = await page.$$('.speed-btn');
for (const btn of speedBtns) {
  const txt = await btn.textContent();
  if (txt.trim() === '10 yr/s') { await btn.click(); break; }
}
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/sim_qaia_run.png' });

await browser.close();
console.log('Done');
