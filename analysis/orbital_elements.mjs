// Compute Keplerian orbital elements from instantaneous position/velocity relative to a central body.
// Works for any simulation snapshot — use instead of nominal a/e so results stay accurate
// after the starting point is advanced by N years of simulation.
//
// Returns { a, e, T_d } where a is in meters, e is dimensionless, T_d is period in days.

import { G } from '../simulation.js';
import { M_EARTH } from '../bodies.js';

const _mu = G * M_EARTH;

export function orbitalElements(body, qaia) {
  const dx  = body.x  - qaia.x,  dy  = body.y  - qaia.y,  dz  = (body.z  ?? 0) - (qaia.z  ?? 0);
  const dvx = body.vx - qaia.vx, dvy = body.vy - qaia.vy, dvz = (body.vz ?? 0) - (qaia.vz ?? 0);
  const r  = Math.sqrt(dx*dx + dy*dy + dz*dz);
  const v2 = dvx*dvx + dvy*dvy + dvz*dvz;
  const a  = 1 / (2/r - v2/_mu);
  const hx = dy*dvz - dz*dvy, hy = dz*dvx - dx*dvz, hz = dx*dvy - dy*dvx;
  const h2 = hx*hx + hy*hy + hz*hz;
  const e  = Math.sqrt(Math.max(0, 1 - h2 / (_mu * a)));
  const T_d = 2 * Math.PI * Math.sqrt(a**3 / _mu) / 86400;
  const inc_deg = Math.acos(Math.abs(hz) / Math.sqrt(h2)) * 180 / Math.PI;
  return { a, e, T_d, inc_deg };
}
