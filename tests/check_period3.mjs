// Isolate which moon causes the drift: run with Qaia+Sun+one moon at a time
import { G, Simulation, Body } from '../simulation.js';
import { createInitialBodies, AU } from '../bodies.js';

const YEAR = 365.25 * 86400;

async function drift(label, bodyFilter) {
  const all = createInitialBodies();
  const bodies = all.filter(bodyFilter);

  // Re-do CM correction for this subset
  let totalMass=0, cmX=0, cmY=0, cmVx=0, cmVy=0, cmVz=0;
  for (const b of bodies) { totalMass+=b.mass; cmX+=b.mass*b.x; cmY+=b.mass*b.y; cmVx+=b.mass*b.vx; cmVy+=b.mass*b.vy; cmVz+=b.mass*b.vz; }
  cmX/=totalMass; cmY/=totalMass;
  cmVx/=totalMass; cmVy/=totalMass; cmVz/=totalMass;
  for (const b of bodies) { b.x-=cmX; b.y-=cmY; b.vx-=cmVx; b.vy-=cmVy; b.vz-=cmVz; }

  const sim = new Simulation(bodies);
  const qaia = bodies.find(b => b.name === 'Qaia');
  const sun  = bodies.find(b => b.name === 'Sun');

  const stepsPerYear = Math.round(YEAR / sim.dt);
  for (let i = 0; i < stepsPerYear * 5; i++) sim._step();

  const dx = qaia.x - sun.x, dy = qaia.y - sun.y;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  console.log(`${label.padEnd(20)}: angle after 5yr = ${angle.toFixed(4)}° → ${(angle/5).toFixed(4)}°/yr`);
}

await drift('Sun+Qaia only',        b => ['Sun','Qaia'].includes(b.name));
await drift('+Primus(anchor)',      b => ['Sun','Qaia','Primus'].includes(b.name));
await drift('+Secundus',            b => ['Sun','Qaia','Secundus'].includes(b.name));
await drift('+Tertius',             b => ['Sun','Qaia','Tertius'].includes(b.name));
await drift('+Quartus',             b => ['Sun','Qaia','Quartus'].includes(b.name));
await drift('+Sextus',              b => ['Sun','Qaia','Sextus'].includes(b.name));
await drift('+Septimus',            b => ['Sun','Qaia','Septimus'].includes(b.name));
await drift('all moons no Quintus', b => b.name !== 'Quintus');
await drift('all (original)',       b => true);
