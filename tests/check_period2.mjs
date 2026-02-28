// Two-body test: just Sun and Qaia, measure orbital period precisely
import { G, Simulation, Body } from '../simulation.js';
import { AU, M_SUN, M_EARTH, R_EARTH } from '../bodies.js';
const R_SUN = 6.96e8;

const v_earth = Math.sqrt(G * M_SUN / AU);
const T_kepler = 2 * Math.PI * Math.sqrt(AU**3 / (G * M_SUN));

console.log('v_earth:', v_earth.toFixed(2), 'm/s');
console.log('T_kepler:', (T_kepler/86400).toFixed(6), 'days =', T_kepler, 's');
console.log('Julian year:', 365.25*86400, 's');
console.log('Difference (kepler - julian):', (T_kepler - 365.25*86400).toFixed(1), 's');

const bodies = [
  new Body({ name:'Sun',  mass:M_SUN,   x:0,  y:0, vx:0, vy:0,         physicalRadius:R_SUN,   minDisplayPx:14, color:'#FFD700', trailColor:'#FFD700', trailMaxLen:100 }),
  new Body({ name:'Qaia', mass:M_EARTH, x:AU, y:0, vx:0, vy:v_earth,   physicalRadius:R_EARTH, minDisplayPx:6,  color:'#4499FF', trailColor:'#4499FF', trailMaxLen:100 }),
];

// CM correction
let totalMass=0, cmX=0, cmY=0, cmVx=0, cmVy=0;
for (const b of bodies) { totalMass+=b.mass; cmX+=b.mass*b.x; cmY+=b.mass*b.y; cmVx+=b.mass*b.vx; cmVy+=b.mass*b.vy; }
cmX/=totalMass; cmY/=totalMass; cmVx/=totalMass; cmVy/=totalMass;
for (const b of bodies) { b.x-=cmX; b.y-=cmY; b.vx-=cmVx; b.vy-=cmVy; }

const sim = new Simulation(bodies);
const qaia=bodies[1], sun=bodies[0];

console.log('\nInitial Qaia: x=', qaia.x.toExponential(4), 'y=', qaia.y, 'vx=', qaia.vx, 'vy=', qaia.vy.toFixed(4));

const YEAR = 365.25 * 86400;
const stepsPerYear = Math.round(YEAR / sim.dt);

for (let yr = 1; yr <= 5; yr++) {
  for (let i = 0; i < stepsPerYear; i++) sim._step();
  const dx = qaia.x - sun.x, dy = qaia.y - sun.y;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  console.log(`2-body Year ${yr}: angle ${angle.toFixed(4)}°, r=${Math.hypot(dx,dy).toExponential(6)}`);
}
