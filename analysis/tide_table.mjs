// Tide table for a port: times and heights of high and low water.
//
//   node analysis/tide_table.mjs <port> [YYYY-MM-DD] [days]
//   node analysis/tide_table.mjs qaringil 2253-03-01 14
//
// Times are local zone time (PMT±n).  Heights are metres relative to mean
// sea level over the table window.  Default start is 1 Feb 2253 (a month
// after the 200-yr snapshot); default length 7 days.

import { findExtrema } from '../tides.js';
import { getPort, parseLocalDate, localTime, zoneName, recordEphemeris, runPort,
         spinupSeconds, DAY, SNAPSHOT_TIME } from './tide_common.mjs';
import { PORTS } from '../ports.js';

const [id, dateArg = '2253-02-01', daysArg = '7'] = process.argv.slice(2);
if (!id) {
  console.error('usage: node analysis/tide_table.mjs <port> [YYYY-MM-DD] [days]');
  console.error('ports: ' + PORTS.map(p => p.id).join(', '));
  process.exit(1);
}
const port = getPort(id);
const days = +daysArg;
const t0 = parseLocalDate(dateArg, port.lon);
const t1 = t0 + days * DAY;
const spin = spinupSeconds();
if (t0 - spin < SNAPSHOT_TIME && t0 >= SNAPSHOT_TIME)
  console.error('note: spin-up reaches before the snapshot; integrating from the epoch (slow)');

const eph = recordEphemeris(t0 - spin, t1 + DAY / 4);
const h = runPort(port, eph);
const k0 = Math.round((t0 - eph.t0) / eph.dt);
const k1 = Math.min(eph.n - 1, Math.round((t1 - eph.t0) / eph.dt));
const win = h.subarray(k0, k1 + 1);
const msl = win.reduce((a, b) => a + b, 0) / win.length;
const ext = findExtrema(eph.t0, eph.dt, h).filter(e => e.t >= t0 && e.t < t1);

console.log(`${port.name} — ${Math.abs(port.lat).toFixed(2)}°${port.lat >= 0 ? 'N' : 'S'} ` +
            `${Math.abs(port.lon).toFixed(2)}°${port.lon >= 0 ? 'E' : 'W'}`);
console.log(`Times ${zoneName(port.lon)}; heights in metres relative to mean sea level.\n`);

let curDay = null, line = '';
for (const e of ext) {
  const lt = localTime(e.t, port.lon);
  if (lt.day !== curDay) {
    if (line) console.log(line);
    curDay = lt.day;
    line = lt.date.replace(' AD', '').padEnd(12);
  }
  const hv = e.h - msl;
  line += `   ${lt.clock} ${e.type} ${(hv >= 0 ? '+' : '−') + Math.abs(hv).toFixed(2)}`;
}
if (line) console.log(line);
