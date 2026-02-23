import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file:///home/sully/src/moons/index.html');
await page.waitForFunction(() => typeof sim !== 'undefined');

const result = await page.evaluate(() => {
  const stepsPerYear = Math.round(365.25 * 86400 / sim.dt);
  const snapshots = [];

  for (let year = 0; year <= 10000; year += 500) {
    const sun     = sim.bodies[0];
    const qaia    = sim.bodies[1];
    const quintus = sim.bodies[sim.bodies.length - 1];

    const angleQaia    = Math.atan2(qaia.y - sun.y, qaia.x - sun.x) * 180 / Math.PI;
    const angleQuintus = Math.atan2(quintus.y - sun.y, quintus.x - sun.x) * 180 / Math.PI;

    let sep = angleQuintus - angleQaia;
    while (sep >  180) sep -= 360;
    while (sep < -180) sep += 360;

    snapshots.push({ year, sep: sep.toFixed(1) });

    if (year < 10000) sim.advance(stepsPerYear * 500, 1000, null);
  }
  return snapshots;
});

for (const s of result) console.log(`${s.year} yr: ${s.sep}°`);

await browser.close();
