// screenshot.mjs — take screenshots of the simulation
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto('file:///home/user/moons/index.html');
await page.waitForFunction(() => typeof renderer !== 'undefined');

// Take a screenshot at t=0
await page.screenshot({ path: '/tmp/sim_t0.png' });

// Switch to Qaia-Primus view
await page.click('text=Qaia-Primus');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/sim_qaia_t0.png' });

// Run for a few seconds at 1 yr/s to see all moons in orbit
const speedBtns = await page.$$('.speed-btn');
// Click 4th speed preset (1 yr/s)
for (const btn of speedBtns) {
  const txt = await btn.textContent();
  if (txt.trim() === '1 yr/s') { await btn.click(); break; }
}
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/sim_qaia_3yr.png' });

// Run more to see all moons still orbiting
await page.waitForTimeout(5000);
await page.screenshot({ path: '/tmp/sim_qaia_8yr.png' });

await browser.close();
console.log('Screenshots written to /tmp/sim_t0.png, /tmp/sim_qaia_t0.png, /tmp/sim_qaia_3yr.png, /tmp/sim_qaia_8yr.png');
