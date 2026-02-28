// 3-body (Sun+Qaia+Quartus): check barycenter orbit and initial velocity
import { G, Simulation } from '../simulation.js';
import { createInitialBodies, AU, M_SUN, M_EARTH, M_MOON } from '../bodies.js';

const YEAR = 365.25 * 86400;
const stepsPerYear = Math.round(YEAR / 360);

const all = createInitialBodies();
const bodies = all.filter(b => ['Sun','Qaia','Quartus'].includes(b.name));

// Redo CM correction for this subset
let totalMass=0, cmX=0, cmY=0, cmVx=0, cmVy=0, cmVz=0;
for (const b of bodies) { totalMass+=b.mass; cmX+=b.mass*b.x; cmY+=b.mass*b.y; cmVx+=b.mass*b.vx; cmVy+=b.mass*b.vy; cmVz+=b.mass*b.vz; }
cmX/=totalMass; cmY/=totalMass; cmVx/=totalMass; cmVy/=totalMass; cmVz/=totalMass;
for (const b of bodies) { b.x-=cmX; b.y-=cmY; b.vx-=cmVx; b.vy-=cmVy; b.vz-=cmVz; }

const sim = new Simulation(bodies);
const sun = bodies[0], qaia = bodies[1], quartus = bodies[2];
const M_QQ = M_EARTH + M_MOON;

// Initial barycenter
const bx0 = (M_EARTH*qaia.x + M_MOON*quartus.x)/M_QQ;
const by0 = (M_EARTH*qaia.y + M_MOON*quartus.y)/M_QQ;
const bvx0= (M_EARTH*qaia.vx+ M_MOON*quartus.vx)/M_QQ;
const bvy0= (M_EARTH*qaia.vy+ M_MOON*quartus.vy)/M_QQ;

const r0   = Math.hypot(bx0 - sun.x, by0 - sun.y);
const vCirc= Math.sqrt(G * (M_SUN + M_QQ) / r0);
console.log('Initial barycenter:');
console.log('  r =', r0.toExponential(6), '(AU =', AU.toExponential(6), ')');
console.log('  vy =', bvy0.toFixed(4), 'm/s');
console.log('  v_circ for circular orbit =', vCirc.toFixed(4), 'm/s');
console.log('  delta_v =', (bvy0 - vCirc).toFixed(6), 'm/s');
console.log('  v/v_circ =', (bvy0/vCirc).toFixed(8));
console.log();

console.log('yr | Qaia | Barycenter');
for (let yr = 0; yr <= 10; yr++) {
  if (yr > 0) for (let i = 0; i < stepsPerYear; i++) sim._step();

  const bx = (M_EARTH*qaia.x + M_MOON*quartus.x)/M_QQ;
  const by = (M_EARTH*qaia.y + M_MOON*quartus.y)/M_QQ;
  const qA = Math.atan2(qaia.y    - sun.y, qaia.x    - sun.x) * 180/Math.PI;
  const bA = Math.atan2(by        - sun.y, bx        - sun.x) * 180/Math.PI;
  console.log(`${yr.toString().padStart(3)} | ${qA.toFixed(4).padStart(10)} | ${bA.toFixed(4).padStart(12)}`);
}
