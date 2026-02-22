import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto('file:///home/sully/src/moons/index.html');
await page.waitForFunction(() => typeof renderer !== 'undefined');
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/retro_solar.png' });

await page.click('text=Qaia-Primus');
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/retro_qaia.png' });

await browser.close();
