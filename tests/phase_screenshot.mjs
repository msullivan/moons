import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto('file:///home/sully/src/moons/index.html');
await page.waitForFunction(() => typeof renderer !== 'undefined');
await page.click('text=Qaia-Primus');
await page.waitForTimeout(500);

// t=0: Primus starts opposite sun → full moon
await page.screenshot({ path: '/tmp/phase_t0.png' });

// Advance ~7 days (quarter orbit of Primus, period ~27 days)
await page.evaluate(() => {
  sim.advance(Math.round(7 * 86400 / sim.dt), 1, renderer.followIndex);
  renderer.render();
  updateHUD();
});
await page.screenshot({ path: '/tmp/phase_t7.png' });

// Advance another 7 days (~14 days total, near new moon)
await page.evaluate(() => {
  sim.advance(Math.round(7 * 86400 / sim.dt), 1, renderer.followIndex);
  renderer.render();
  updateHUD();
});
await page.screenshot({ path: '/tmp/phase_t14.png' });

// Advance another 7 days (~21 days, waxing quarter)
await page.evaluate(() => {
  sim.advance(Math.round(7 * 86400 / sim.dt), 1, renderer.followIndex);
  renderer.render();
  updateHUD();
});
await page.screenshot({ path: '/tmp/phase_t21.png' });

await browser.close();
