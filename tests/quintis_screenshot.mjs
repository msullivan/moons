import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto('file:///home/sully/src/moons/index.html');
await page.waitForFunction(() => typeof renderer !== 'undefined');

await page.evaluate(() => {
  renderer.scale = 5e8;
  renderer.followIndex = null;
  renderer.panX = 0;
  renderer.panY = 0;
  renderer.render();
  if (typeof updateHUD === 'function') updateHUD();
});

await page.screenshot({ path: '/tmp/quintis_solar.png' });

await browser.close();
