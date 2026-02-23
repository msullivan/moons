// Compute physical and observational statistics for all moons.
// Run with: node tests/moon_stats.mjs
// Re-run after changing any parameters in bodies.js.

import { G } from '../simulation.js';
import { M_MOON, R_MOON, LUNAR_DIST, AU, M_EARTH, R_EARTH, M_SUN } from '../bodies.js';

const mu = G * M_EARTH;
const RHO_MOON  = M_MOON / (4/3 * Math.PI * R_MOON**3);
const RHO_EARTH = M_EARTH / (4/3 * Math.PI * R_EARTH**3);

// Hill sphere of Qaia
const R_HILL = AU * (M_EARTH / (3 * M_SUN)) ** (1/3);

// Moon definitions — kept in sync with bodies.js
// mass_frac: M / M_moon
// density_ratio: rho / rho_moon  (radius derived from these two)
const moons = [
  { name: 'Secundus', mass_frac: 0.04, density_ratio: 2, a_LD: 0.24, e: 0.10, dir: 'retrograde' },
  { name: 'Tertius',  mass_frac: 0.25, density_ratio: 1, a_LD: 0.45, e: 0.10, dir: 'prograde'   },
  { name: 'Quartus',  mass_frac: 1.00, density_ratio: 1, a_LD: 1.00, e: 0.10, dir: 'prograde'   },
  { name: 'Sextus',   mass_frac: 0.01, density_ratio: 1, a_LD: 1.90, e: 0.10, dir: 'retrograde' },
  { name: 'Septimus', mass_frac: 0.01, density_ratio: 1, a_LD: 2.20, e: 0.10, dir: 'retrograde' },
];

// First pass: compute intrinsic properties
for (const m of moons) {
  m.M    = m.mass_frac * M_MOON;
  m.R    = R_MOON * Math.cbrt(m.mass_frac / m.density_ratio);
  m.rho  = m.density_ratio * RHO_MOON;
  m.a    = m.a_LD * LUNAR_DIST;
  m.T_d  = 2 * Math.PI * Math.sqrt(m.a**3 / mu) / 86400;
  m.ang_mean = 2 * m.R / m.a * (180/Math.PI) * 60;
  m.ang_peri = 2 * m.R / (m.a*(1-m.e)) * (180/Math.PI) * 60;
  m.ang_apo  = 2 * m.R / (m.a*(1+m.e)) * (180/Math.PI) * 60;
  m.g_surf   = G * m.M / m.R**2;
  m.v_esc    = Math.sqrt(2 * G * m.M / m.R);
  m.SA_Mkm2  = 4 * Math.PI * (m.R/1e3)**2 / 1e6;
  m.hill_pct    = m.a / R_HILL * 100;
  m.roche_rigid  = 1.26 * R_EARTH * (RHO_EARTH / m.rho)**(1/3);
  m.roche_margin = m.a / m.roche_rigid;
}

// Second pass: ref-relative properties (needs ref.M, ref.R, ref.a all set)
const ref = moons.find(m => m.name === 'Quartus');
for (const m of moons) {
  m.tidal_ratio  = (m.M / ref.M) * (ref.a / m.a)**3;
  m.bright_ratio = (m.R * ref.a)**2 / (ref.R * m.a)**2;
  m.delta_mag    = -2.5 * Math.log10(m.bright_ratio);
  m.app_mag      = -12.74 + m.delta_mag;
}

// Output
console.log(`Hill sphere: ${(R_HILL/LUNAR_DIST).toFixed(2)} LD\n`);
for (const m of moons) {
  console.log(`=== ${m.name} (${m.dir}) ===`);
  console.log(`  Mass:          ${m.mass_frac.toFixed(3)} M_moon  =  ${(m.M/1e21).toFixed(3)} × 10²¹ kg`);
  console.log(`  Radius:        ${(m.R/1e3).toFixed(0)} km  (${(m.R/R_MOON).toFixed(3)} R_moon)`);
  console.log(`  Density:       ${m.rho.toFixed(0)} kg/m³  (${m.density_ratio}× lunar)`);
  console.log(`  Semi-major:    ${m.a_LD.toFixed(2)} LD  /  period ${m.T_d.toFixed(2)} days`);
  console.log(`  Angular diam:  ${m.ang_mean.toFixed(1)}′ mean  (${m.ang_peri.toFixed(1)}′ peri – ${m.ang_apo.toFixed(1)}′ apo)`);
  console.log(`  vs Quartus:    ×${(m.ang_mean / ref.ang_mean).toFixed(3)} angular size`);
  console.log(`  Full-moon mag: ${m.app_mag.toFixed(2)}  (${m.delta_mag >= 0 ? '+' : ''}${m.delta_mag.toFixed(2)} vs Quartus = −12.74)`);
  console.log(`  Surface grav:  ${m.g_surf.toFixed(3)} m/s²  (×${(m.g_surf/ref.g_surf).toFixed(3)} Quartus)`);
  console.log(`  Surface area:  ${m.SA_Mkm2.toFixed(2)} M km²  (${(m.SA_Mkm2 / ref.SA_Mkm2 * 100).toFixed(1)}% of Quartus)`);
  console.log(`  Escape vel:    ${m.v_esc.toFixed(0)} m/s`);
  console.log(`  Tidal force:   ×${m.tidal_ratio.toFixed(3)} vs Quartus`);
  console.log(`  Hill frac:     ${m.hill_pct.toFixed(1)}%`);
  console.log(`  Roche margin:  ×${m.roche_margin.toFixed(1)} (rigid body)`);
  console.log();
}
