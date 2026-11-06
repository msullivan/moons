// Check the tides.js Channel against the analytic quarter-wave response.
// Uniform equilibrium forcing has no along-channel gradient, so the surface
// obeys the plain damped wave equation with η(L) = G·cos ωt held at the
// mouth.  With linear friction r:
//   k² = (ω² − iωr) / (g h),   η(x) = G · cos(kx) / cos(kL) · cos ωt
// where x is measured from the closed head.
//   node tests/tide_channel_check.mjs
import { Channel } from '../tides.js';

const R = 6.371e6, dt = 360, g = 9.81;
const basin = { head: { lat: 45, lon: 30 }, mouth: { lat: 37, lon: 30 },
                depth: 220, damping: 30, cells: 40, ocean: { G: 2 } };

const cabs = (re, im) => Math.hypot(re, im);
// cos of complex z = a + ib: cos a cosh b − i sin a sinh b
const ccos = (a, b) => [Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)];

let worst = 0;
for (const Th of [9.8, 12.4, 13.7, 19.6, 21.0, 24.8, 27.3, 40]) {
  const ch = new Channel(basin, dt, R);
  const w = 2 * Math.PI / (Th * 3600), r = 1 / (basin.damping * 3600);
  let t = 0;
  ch.forcingAt = () => Math.cos(w * t);
  const nSpin = Math.round(40 * 86400 / dt), nMeas = Math.round(10 * Th * 3600 / dt);
  let max = { 0: 0, 0.5: 0 };
  for (let n = 0; n < nSpin + nMeas; n++, t += dt) {
    ch.step(null);
    if (n >= nSpin) for (const s of [0, 0.5]) max[s] = Math.max(max[s], Math.abs(ch.heightAt(s)));
  }
  // k = sqrt((ω² − iωr)/c²): principal complex square root.
  const c2 = g * basin.depth, re = w * w / c2, im = -w * r / c2;
  const mod = Math.sqrt(cabs(re, im)), arg = Math.atan2(im, re) / 2;
  const kr = mod * Math.cos(arg), ki = mod * Math.sin(arg);
  const den = ccos(kr * ch.L, ki * ch.L);
  const line = [`T=${Th.toString().padStart(4)} h`];
  for (const s of [0, 0.5]) {
    const x = s * ch.L, num = ccos(kr * x, ki * x);
    const expect = basin.ocean.G * cabs(...num) / cabs(...den);
    const err = Math.abs(max[s] / expect - 1);
    worst = Math.max(worst, err);
    line.push(`s=${s}: model ${max[s].toFixed(3)}  analytic ${expect.toFixed(3)}  (${(100 * err).toFixed(1)}%)`);
  }
  console.log(line.join('   '));
}
console.log(`worst relative error ${(100 * worst).toFixed(1)}%`);
process.exit(worst < 0.05 ? 0 : 1);
