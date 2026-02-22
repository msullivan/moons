// outer_sweep.mjs — scan outer moon semi-major axes, prograde and retrograde
// Run with: node tests/outer_sweep.mjs

const G = 6.674e-11;
const AU = 1.496e11;
const LUNAR_DIST = 3.844e8;
const M_SUN   = 1.989e30;
const M_EARTH = 5.972e24;
const M_MOON  = 7.342e22;

// Current inner system (fixed)
const M_QUARTUS      = M_MOON * 0.02;
const QUARTUS_E      = 0.10;
const QUARTUS_A      = 0.12 * LUNAR_DIST;
const QUARTUS_R_PERI = QUARTUS_A * (1 - QUARTUS_E);

const M_TERTIUS      = M_MOON * 0.04;
const TERTIUS_E      = 0.10;
const TERTIUS_A      = 0.24 * LUNAR_DIST;
const TERTIUS_R_PERI = TERTIUS_A * (1 - TERTIUS_E);

const M_SECUNDUS      = M_MOON / 4;
const SECUNDUS_E      = 0.10;
const SECUNDUS_A      = 0.45 * LUNAR_DIST;
const SECUNDUS_R_PERI = SECUNDUS_A * (1 - SECUNDUS_E);

const PRIMUS_INCLINATION = 5.14 * Math.PI / 180;

// Outer moon test params
const M_OUTER = M_MOON * 0.5;  // half a lunar mass
const OUTER_E = 0.10;

function createBodies(outer_a_ld, retrograde) {
  const OUTER_A      = outer_a_ld * LUNAR_DIST;
  const OUTER_R_PERI = OUTER_A * (1 - OUTER_E);

  const v_earth        = Math.sqrt(G * M_SUN   / AU);
  const v_moon_rel     = Math.sqrt(G * M_EARTH / LUNAR_DIST);
  const v_quartus_peri = Math.sqrt(G * M_EARTH * (1 + QUARTUS_E) / QUARTUS_R_PERI);
  const v_tertius_peri = Math.sqrt(G * M_EARTH * (1 + TERTIUS_E) / TERTIUS_R_PERI);
  const v_sec_peri     = Math.sqrt(G * M_EARTH * (1 + SECUNDUS_E) / SECUNDUS_R_PERI);
  const v_outer_peri   = Math.sqrt(G * M_EARTH * (1 + OUTER_E)   / OUTER_R_PERI);

  // Outer moon at periapsis in +y from Qaia; prograde v in -x, retrograde v in +x
  const outer_vx = retrograde ? v_outer_peri : -v_outer_peri;

  const bodies = [
    { name:'Sun',     mass:M_SUN,      x:0,                  y:0,               z:0, vx:0,            vy:0,        vz:0 },
    { name:'Qaia',    mass:M_EARTH,    x:AU,                 y:0,               z:0, vx:0,            vy:v_earth,  vz:0 },
    { name:'Primus',  mass:M_MOON,     x:AU+LUNAR_DIST,      y:0,               z:0, vx:0,            vy:v_earth+v_moon_rel*Math.cos(PRIMUS_INCLINATION), vz:v_moon_rel*Math.sin(PRIMUS_INCLINATION) },
    { name:'Secundus',mass:M_SECUNDUS, x:AU,                 y:SECUNDUS_R_PERI, z:0, vx:-v_sec_peri,  vy:v_earth,  vz:0 },
    { name:'Quartus', mass:M_QUARTUS,  x:AU-QUARTUS_R_PERI,  y:0,               z:0, vx:0,            vy:v_earth+v_quartus_peri, vz:0 },
    { name:'Tertius', mass:M_TERTIUS,  x:AU,                 y:-TERTIUS_R_PERI, z:0, vx:-v_tertius_peri, vy:v_earth, vz:0 },
    { name:'Outer',   mass:M_OUTER,    x:AU,                 y:OUTER_R_PERI,    z:0, vx:outer_vx,     vy:v_earth,  vz:0 },
  ];
  for (const b of bodies) { b.ax=0; b.ay=0; b.az=0; }

  let tot=0,cx=0,cy=0,cz=0,cvx=0,cvy=0,cvz=0;
  for (const b of bodies) {
    tot+=b.mass; cx+=b.mass*b.x; cy+=b.mass*b.y; cz+=b.mass*b.z;
    cvx+=b.mass*b.vx; cvy+=b.mass*b.vy; cvz+=b.mass*b.vz;
  }
  cx/=tot; cy/=tot; cz/=tot; cvx/=tot; cvy/=tot; cvz/=tot;
  for (const b of bodies) {
    b.x-=cx; b.y-=cy; b.z-=cz;
    b.vx-=cvx; b.vy-=cvy; b.vz-=cvz;
  }
  return bodies;
}

function computeAcc(bodies) {
  for (const b of bodies) { b.ax=0; b.ay=0; b.az=0; }
  for (let i=0;i<bodies.length;i++) for (let j=i+1;j<bodies.length;j++) {
    const bi=bodies[i], bj=bodies[j];
    const dx=bj.x-bi.x, dy=bj.y-bi.y, dz=bj.z-bi.z;
    const r2=dx*dx+dy*dy+dz*dz, r3=r2*Math.sqrt(r2), f=G/r3;
    bi.ax+=f*bj.mass*dx; bi.ay+=f*bj.mass*dy; bi.az+=f*bj.mass*dz;
    bj.ax-=f*bi.mass*dx; bj.ay-=f*bi.mass*dy; bj.az-=f*bi.mass*dz;
  }
}

function stepVV(bodies, dt) {
  const h=0.5*dt*dt;
  for (const b of bodies) { b.x+=b.vx*dt+b.ax*h; b.y+=b.vy*dt+b.ay*h; b.z+=b.vz*dt+b.az*h; }
  const ax0=bodies.map(b=>b.ax), ay0=bodies.map(b=>b.ay), az0=bodies.map(b=>b.az);
  computeAcc(bodies);
  for (let i=0;i<bodies.length;i++) {
    bodies[i].vx+=0.5*(ax0[i]+bodies[i].ax)*dt;
    bodies[i].vy+=0.5*(ay0[i]+bodies[i].ay)*dt;
    bodies[i].vz+=0.5*(az0[i]+bodies[i].az)*dt;
  }
}

function specificEnergy(moon, qaia) {
  const dx=moon.x-qaia.x, dy=moon.y-qaia.y, dz=moon.z-qaia.z;
  const r=Math.sqrt(dx*dx+dy*dy+dz*dz);
  const dvx=moon.vx-qaia.vx, dvy=moon.vy-qaia.vy, dvz=moon.vz-qaia.vz;
  return 0.5*(dvx*dvx+dvy*dvy+dvz*dvz) - G*qaia.mass/r;
}

function run(outer_a_ld, retrograde, maxYr) {
  const dt=360, YEAR=365.25*86400;
  const stepsPerCheck=Math.round(10*YEAR/dt);
  const bodies=createBodies(outer_a_ld, retrograde);
  computeAcc(bodies);
  const qaia=bodies[1];
  const moons=bodies.slice(2);

  for (let yr=10; yr<=maxYr; yr+=10) {
    for (let s=0; s<stepsPerCheck; s++) stepVV(bodies, dt);
    for (const m of moons) {
      if (specificEnergy(m, qaia) > 0) return { ejected: m.name, yr };
    }
  }
  return { ejected: null };
}

const MAX_YR = 200;
const candidates = [1.5, 2.0, 2.5, 3.0, 4.0, 5.0];

console.log(`Outer moon sweep (0.5 LM, e=0.10) to ${MAX_YR} yr\n`);
console.log('  a (LD)  prograde          retrograde');
console.log('  ------  --------          ----------');
for (const a of candidates) {
  const pro  = run(a, false, MAX_YR);
  const retro = run(a, true,  MAX_YR);
  const proStr   = pro.ejected   ? `${pro.ejected} @ yr ${pro.yr}`.padEnd(18) : `stable ✓`.padEnd(18);
  const retroStr = retro.ejected ? `${retro.ejected} @ yr ${retro.yr}`        : `stable ✓`;
  console.log(`  ${String(a).padEnd(6)}  ${proStr}  ${retroStr}`);
}
