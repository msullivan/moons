import { chromium } from 'playwright';

const SHELL_PATH = '/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell';

const browser = await chromium.launch({ executablePath: SHELL_PATH });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto('file:///home/user/moons/index.html');
await page.waitForFunction(() => typeof renderer !== 'undefined');
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/sim_solar.png' });

await page.click('text=Qaia-Primus');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/sim_qaia_init.png' });

// Run at 10 yr/s
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.speed-btn')].find(b => b.textContent === '10 yr/s');
  if (btn) btn.click();
});
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/sim_qaia_running.png' });

const info = await page.evaluate(() => {
  const days = sim.time / 86400;
  const qaia = sim.bodies[1];
  const moons = sim.bodies.slice(2).map(m => {
    const dx = m.x - qaia.x, dy = m.y - qaia.y, dz = m.z - qaia.z;
    const r = Math.sqrt(dx*dx+dy*dy+dz*dz) / 3.844e8;
    const dvx = m.vx - qaia.vx, dvy = m.vy - qaia.vy, dvz = m.vz - qaia.vz;
    const eps = 0.5*(dvx*dvx+dvy*dvy+dvz*dvz) - 6.674e-11 * 5.972e24 / (r * 3.844e8);
    return { name: m.name, r_ld: r.toFixed(3), bound: eps < 0 };
  });
  return { simDays: days.toFixed(1), moons };
});
console.log('State after 3s at 10 yr/s:', JSON.stringify(info, null, 2));

await browser.close();
