// Qaia's rotating reference frames, shared by the sky view and the tide model.
//
// Pipeline:
//   1. Inertial ecliptic (x,y,z) — the simulation frame
//   2. Equatorial basis (p1,p2,p3) — rotated by the axial tilt around y
//   3. Body-fixed (b1,b2,b3) — spinning with Qaia's sidereal rotation
//   4. Observer local frame (zen,east,nor) — at a given lat/lon
//
//  (a) Ecliptic → equatorial: rotate (dx, dz) by the axial tilt I = 23.5°
//      around the y-axis, so the basis is aligned with Qaia's equator rather
//      than the orbital plane.  Equatorial basis vectors in ecliptic components:
//        e1(0) = (cosI, 0, −sinI)  — prime meridian at t=0 (toward Primus)
//        e2    = (0, 1, 0)         — 90° east in the equatorial plane
//        e3    = (sinI, 0, cosI)   — spin axis (north pole)
//      Primus orbits in Qaia's equatorial plane, so its inclination to the
//      ecliptic *is* the obliquity.
//
//  (b) Inertial equatorial → body-fixed: rotate (p1, p2) by θ = ω·t.
//        b1 = toward the sub-Primus equatorial point (0°N, 0°E)
//        b2 = east at that point (90°E)
//        b3 = north pole (= p3, unchanged by the spin)
//
//  (c) Body-fixed → observer's local frame at (φ, λ):
//        ẑ = (cosφ·cosλ,  cosφ·sinλ,  sinφ)       zenith
//        ê = (−sinλ,  cosλ,  0)                   east
//        n̂ = (−sinφ·cosλ,  −sinφ·sinλ,  cosφ)     north
//
// Matrices are flat row-major 3×3 arrays [m00,m01,m02, m10,…, m22].

import { PRIMUS_INCLINATION, QAIA_SIDEREAL_DAY } from './bodies.js';

export const AXIAL_TILT = PRIMUS_INCLINATION;
export const SPIN_RATE  = 2 * Math.PI / QAIA_SIDEREAL_DAY;   // rad/s, sidereal

const COS_I = Math.cos(AXIAL_TILT);
const SIN_I = Math.sin(AXIAL_TILT);

// Ecliptic → body-fixed rotation at sim time t (stages a + b).
export function bodyFixedMatrix(t) {
  const theta = SPIN_RATE * t;
  const c = Math.cos(theta), s = Math.sin(theta);
  return [
     c * COS_I, s, -c * SIN_I,
    -s * COS_I, c,  s * SIN_I,
         SIN_I, 0,      COS_I,
  ];
}

// Body-fixed → observer local (zen, east, nor) at (latDeg, lonDeg) (stage c).
// Longitude is east of the sub-Primus meridian.
export function observerMatrix(latDeg, lonDeg) {
  const phi = latDeg * Math.PI / 180, lam = lonDeg * Math.PI / 180;
  const cP = Math.cos(phi), sP = Math.sin(phi);
  const cL = Math.cos(lam), sL = Math.sin(lam);
  return [
     cP * cL,  cP * sL, sP,
    -sL,       cL,      0,
    -sP * cL, -sP * sL, cP,
  ];
}

// Apply a 3×3 matrix to (x, y, z).  Returns a fresh [a, b, c].
export function apply(m, x, y, z) {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
}

// Matrix product a × b.
export function compose(a, b) {
  const out = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      out[3 * i + j] = a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j];
  return out;
}
