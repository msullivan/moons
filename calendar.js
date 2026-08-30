// Calendar and clock formatting.
//
// t = 0 is 1 Jan 2053 AD (Arrival of Dragons).  A day is MEAN_SOLAR_DAY long,
// not 86400 s, so the civil calendar stays locked to Primus Mean Time rather
// than drifting against it.  Gregorian leap rules apply.
//
// This module is deliberately free of DOM and simulation state so it can be
// exercised directly from Node — see tests/calendar_test.mjs.

import { MEAN_SOLAR_DAY } from './bodies.js';

export const EPOCH_YEAR = 2053;
const EPOCH_MS  = Date.UTC(EPOCH_YEAR, 0, 1); // ms since Unix epoch
const MON_DAYS  = [31,28,31,30,31,30,31,31,30,31,30,31];
const MON_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function isLeap(y) {
  return (y % 4 === 0) && (y % 100 !== 0 || y % 400 === 0);
}

// Calendar date for a sim time, e.g. "3 Feb 2253 AD".  Negative times walk
// back before the epoch — a westward time zone can put local midnight there.
export function simDate(t) {
  let d = Math.floor(t / MEAN_SOLAR_DAY);
  let y = EPOCH_YEAR;
  while (d < 0)                        { y--; d += isLeap(y) ? 366 : 365; }
  while (d >= (isLeap(y) ? 366 : 365)) { d -= isLeap(y) ? 366 : 365; y++; }
  for (let m = 0; m < 12; m++) {
    const dim = MON_DAYS[m] + (m === 1 && isLeap(y) ? 1 : 0);
    if (d < dim) return `${d + 1} ${MON_NAMES[m]} ${y} AD`;
    d -= dim;
  }
}

// "3 Feb 2253 AD" → "3 Feb".  Used where the year is already on screen.
function shortDate(dateStr) {
  return dateStr.split(' ').slice(0, 2).join(' ');
}

// Fraction of the mean solar day elapsed at t, in [0, 1).
function dayFraction(t) {
  return ((t % MEAN_SOLAR_DAY) + MEAN_SOLAR_DAY) % MEAN_SOLAR_DAY / MEAN_SOLAR_DAY;
}

// Clock time within the mean solar day, e.g. "14:32".
export function clockHM(t) {
  const hours = dayFraction(t) * 24;
  const hh = Math.floor(hours).toString().padStart(2, '0');
  const mm = Math.floor((hours % 1) * 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

// Primus Mean Time: mean solar time at the sub-Primus meridian.
// At t=0 the Sun is anti-Primus (midnight), so PMT 0h = t mod MEAN_SOLAR_DAY = 0.
export function primusMeanTime(t) {
  const h = Math.floor(dayFraction(t) * 24).toString().padStart(2, '0');
  return `${h}h PMT`;
}

// Time zones are whole-hour offsets from PMT, one per 15° of longitude
// (east positive), so Qarangil at 30°E keeps PMT+2 and the Sun crosses its
// meridian near 12:00 local.
export function zoneOffset(lonDeg) {
  return Math.round(lonDeg / 15);
}

// Local civil time at a longitude, e.g. "14:32 PMT+2".  The local date is
// appended when the offset has carried it across midnight relative to the
// PMT date shown alongside it in the HUD.
export function localZoneTime(t, lonDeg) {
  const off  = zoneOffset(lonDeg);
  const tl   = t + off * (MEAN_SOLAR_DAY / 24);
  const zone = `PMT${off < 0 ? '−' : '+'}${Math.abs(off)}`;
  const local = simDate(tl);
  const day   = local === simDate(t) ? '' : ` · ${shortDate(local)}`;
  return `${clockHM(tl)} ${zone}${day}`;
}

// Convert year/month(0-indexed)/day(1-indexed) → sim seconds.
// Uses MEAN_SOLAR_DAY so the calendar stays in sync with PMT.
export function calToSimTime(year, month0, day) {
  return (Date.UTC(year, month0, day) - EPOCH_MS) / 1000 * (MEAN_SOLAR_DAY / 86400);
}
