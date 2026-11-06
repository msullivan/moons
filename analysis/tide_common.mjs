// Node wrapper around tide_analysis.js: loads the 200-yr snapshot from disk
// and adds a port lookup.  Used by tide_table.mjs and port_report.mjs.

import { readFileSync } from 'fs';
import * as TA from '../tide_analysis.js';
import { simDate } from '../calendar.js';
import { PORTS_BY_ID } from '../ports.js';

export * from '../tide_analysis.js';

const SNAPSHOT = JSON.parse(readFileSync(new URL('../state_200yr.json', import.meta.url)));
export const SNAPSHOT_TIME = SNAPSHOT.time;

export function getPort(id) {
  const p = PORTS_BY_ID[id];
  if (!p) throw new Error(`unknown port '${id}' — known: ${Object.keys(PORTS_BY_ID).join(', ')}`);
  return p;
}

export function recordEphemeris(t0, t1) {
  if (t0 < SNAPSHOT_TIME)
    process.stderr.write(`note: ${simDate(t0)} is before the 200-yr snapshot; integrating from the epoch (slow)\n`);
  return TA.recordEphemeris(SNAPSHOT, t0, t1);
}
