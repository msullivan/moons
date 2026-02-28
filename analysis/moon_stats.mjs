// Compute physical and observational statistics for all moons.
// Run with: node analysis/moon_stats.mjs
// Re-run after changing any parameters in bodies.js.

import { G } from '../simulation.js';
import { M_MOON, R_MOON, LUNAR_DIST, AU, M_EARTH, R_EARTH, M_SUN, MOON_PARAMS, createInitialBodies, applySnapshot } from '../bodies.js';
import { orbitalElements } from './orbital_elements.mjs';
import { readFileSync } from 'fs';

const RHO_MOON  = M_MOON / (4/3 * Math.PI * R_MOON**3);
const RHO_EARTH = M_EARTH / (4/3 * Math.PI * R_EARTH**3);
const R_HILL    = AU * (M_EARTH / (3 * M_SUN)) ** (1/3);

// Load 200-year snapshot for orbital element calculations
const snapshotPath = new URL('../state_200yr.json', import.meta.url).pathname;
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const bodies = applySnapshot(createInitialBodies(), snapshot);
const qaia   = bodies.find(b => b.name === 'Qaia');

// Build analysis objects: physical properties from MOON_PARAMS, orbital elements from snapshot
const moons = MOON_PARAMS.map(m => {
  const body      = bodies.find(b => b.name === m.name);
  const { a, e, T_d, inc_deg } = orbitalElements(body, qaia);
  return {
    ...m,
    a, e, T_d, inc_deg,
    a_LD: a / LUNAR_DIST,
    dir:      m.prograde ? 'prograde' : 'retrograde',
    rho:      m.M / (4/3 * Math.PI * m.R**3),
    ang_mean: 2 * m.R / a * (180/Math.PI) * 60,
    ang_peri: 2 * m.R / (a * (1 - e)) * (180/Math.PI) * 60,
    ang_apo:  2 * m.R / (a * (1 + e)) * (180/Math.PI) * 60,
    g_surf:   G * m.M / m.R**2,
    v_esc:    Math.sqrt(2 * G * m.M / m.R),
    SA_Mkm2:  4 * Math.PI * (m.R / 1e3)**2 / 1e6,
    hill_pct:     a / R_HILL * 100,
    roche_rigid:  1.26 * R_EARTH * (RHO_EARTH / (m.M / (4/3 * Math.PI * m.R**3)))**(1/3),
  };
});

// Ref-relative properties (tidal, brightness)
const ref = moons.find(m => m.name === 'Quartus');
for (const m of moons) {
  m.tidal_ratio  = (m.M / ref.M) * (ref.a / m.a)**3;
  // TODO: bright_ratio uses ref.a from the snapshot, but -12.74 is calibrated for
  // Quartus at exactly 1.00 LD. Should use mp.Quartus.a (nominal) here instead so
  // magnitudes don't shift spuriously when Quartus drifts.
  m.bright_ratio = (m.albedo / ref.albedo) * (m.R * ref.a)**2 / (ref.R * m.a)**2;
  m.delta_mag    = -2.5 * Math.log10(m.bright_ratio);
  m.app_mag      = -12.74 + m.delta_mag;
  m.roche_margin = m.a / m.roche_rigid;
}

// Output
console.log(`Hill sphere: ${(R_HILL/LUNAR_DIST).toFixed(2)} LD\n`);
for (const m of moons) {
  console.log(`=== ${m.name} (${m.dir}) ===`);
  console.log(`  Mass:          ${m.mass_frac.toFixed(4)} M_moon  =  ${(m.M/1e21).toFixed(3)} × 10²¹ kg`);
  console.log(`  Radius:        ${(m.R/1e3).toFixed(0)} km  (${(m.R/R_MOON).toFixed(3)} R_moon)`);
  console.log(`  Density:       ${m.rho.toFixed(0)} kg/m³  (${(m.rho/RHO_MOON).toFixed(2)}× lunar)`);
  console.log(`  Semi-major:    ${m.a_LD.toFixed(3)} LD  /  period ${m.T_d.toFixed(2)} days  /  incl ${m.inc_deg.toFixed(2)}°`);
  console.log(`  Angular diam:  ${m.ang_mean.toFixed(1)}′ mean  (${m.ang_peri.toFixed(1)}′ peri – ${m.ang_apo.toFixed(1)}′ apo)`);
  console.log(`  vs Quartus:    ×${(m.ang_mean / ref.ang_mean).toFixed(3)} angular size`);
  console.log(`  Full-moon mag: ${m.app_mag.toFixed(2)}  (${m.delta_mag >= 0 ? '+' : ''}${m.delta_mag.toFixed(2)} vs Quartus = −12.74)  illum ×${m.bright_ratio.toFixed(3)} Quartus`);
  console.log(`  Surface grav:  ${m.g_surf.toFixed(3)} m/s²  (×${(m.g_surf/ref.g_surf).toFixed(3)} Quartus)`);
  console.log(`  Surface area:  ${m.SA_Mkm2.toFixed(2)} M km²  (${(m.SA_Mkm2 / ref.SA_Mkm2 * 100).toFixed(1)}% of Quartus)`);
  console.log(`  Escape vel:    ${m.v_esc.toFixed(0)} m/s`);
  console.log(`  Tidal force:   ×${m.tidal_ratio.toFixed(3)} vs Quartus`);
  console.log(`  Hill frac:     ${m.hill_pct.toFixed(1)}%`);
  console.log(`  Roche margin:  ×${m.roche_margin.toFixed(1)} (rigid body)`);
  console.log();
}
