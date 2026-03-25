// best_phase.mjs — 1-degree sweep near 315° to find the most stable 4-moon phase

const G = 6.674e-11;
const AU = 1.496e11;
const LUNAR_DIST = 3.844e8;
const M_SUN   = 1.989e30;
const M_EARTH = 5.972e24;
const M_MOON  = 7.342e22;

const M_INNER1   = M_MOON * 0.02;
const INNER1_E   = 0.10;
const INNER1_A   = 0.12 * LUNAR_DIST;
const INNER1_R_PERI = INNER1_A * (1 - INNER1_E);
const M_INNER2   = M_MOON * 0.04;
const INNER2_E   = 0.10;
const INNER2_A   = 0.24 * LUNAR_DIST;
const INNER2_R_PERI = INNER2_A * (1 - INNER2_E);
const M_SECUNDUS = M_MOON / 4;
const SECUNDUS_E = 0.10;
const SECUNDUS_A = 0.45 * LUNAR_DIST;
const SECUNDUS_R_PERI = SECUNDUS_A * (1 - SECUNDUS_E);
const PRIMUS_INCLINATION = 5.14 * Math.PI / 180;

function createBodies(inner2_phase_deg) {
  const phi = inner2_phase_deg * Math.PI / 180;
  const v_earth = Math.sqrt(G * M_SUN / AU);
  const v_moon_rel = Math.sqrt(G * M_EARTH / LUNAR_DIST);
  const v_inner1_peri = Math.sqrt(G * M_EARTH * (1 + INNER1_E) / INNER1_R_PERI);
  const v_inner2_peri = Math.sqrt(G * M_EARTH * (1 + INNER2_E) / INNER2_R_PERI);
  const v_sec_peri    = Math.sqrt(G * M_EARTH * (1 + SECUNDUS_E) / SECUNDUS_R_PERI);

  const bodies = [
    { name:'Sun',     mass:M_SUN,      x:0,                             y:0,                                z:0, vx:0,                              vy:0,                                              vz:0 },
    { name:'Qaia',    mass:M_EARTH,    x:AU,                            y:0,                                z:0, vx:0,                              vy:v_earth,                                        vz:0 },
    { name:'Primus',  mass:M_MOON,     x:AU+LUNAR_DIST,                 y:0,                                z:0, vx:0,                              vy:v_earth+v_moon_rel*Math.cos(PRIMUS_INCLINATION), vz:v_moon_rel*Math.sin(PRIMUS_INCLINATION) },
    { name:'Secundus',mass:M_SECUNDUS, x:AU,                            y:SECUNDUS_R_PERI,                  z:0, vx:-v_sec_peri,                    vy:v_earth,                                        vz:0 },
    { name:'Inner1',  mass:M_INNER1,   x:AU-INNER1_R_PERI,             y:0,                                z:0, vx:0,                              vy:v_earth-v_inner1_peri,                           vz:0 },
    { name:'Inner2',  mass:M_INNER2,   x:AU+INNER2_R_PERI*Math.cos(phi), y:INNER2_R_PERI*Math.sin(phi),   z:0, vx:v_inner2_peri*(-Math.sin(phi)), vy:v_earth+v_inner2_peri*Math.cos(phi),             vz:0 },
  ];
  for (const b of bodies) { b.ax=0; b.ay=0; b.az=0; }
  let tot=0,cx=0,cy=0,cz=0,cvx=0,cvy=0,cvz=0;
  for (const b of bodies) {
    tot+=b.mass; cx+=b.mass*b.x; cy+=b.mass*b.y; cz+=b.mass*b.z;
    cvx+=b.mass*b.vx; cvy+=b.mass*b.vy; cvz+=b.mass*b.vz;
  }
  cx/=tot; cy/=tot; cz/=tot; cvx/=tot; cvy/=tot; cvz/=tot;
  for (const b of bodies) { b.x-=cx; b.y-=cy; b.z-=cz; b.vx-=cvx; b.vy-=cvy; b.vz-=cvz; }
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
function epsBind(moon, qaia) {
  const dx=moon.x-qaia.x, dy=moon.y-qaia.y, dz=moon.z-qaia.z;
  const r=Math.sqrt(dx*dx+dy*dy+dz*dz);
  const dvx=moon.vx-qaia.vx, dvy=moon.vy-qaia.vy, dvz=moon.vz-qaia.vz;
  return 0.5*(dvx*dvx+dvy*dvy+dvz*dvz)-G*qaia.mass/r;
}

function runToYear(phase, maxYr) {
  const dt=360, YEAR=365.25*86400;
  const chkSteps=Math.round(10*YEAR/dt);
  const bodies=createBodies(phase);
  computeAcc(bodies);
  const qaia=bodies[1];
  const moons=bodies.slice(2);
  for (let yr=10;yr<=maxYr;yr+=10) {
    for (let s=0;s<chkSteps;s++) stepVV(bodies,dt);
    for (const m of moons) {
      if (epsBind(m,qaia)>0) return yr;
    }
  }
  return maxYr + 1;
}

// Fine sweep near 315° (range 285°-345°, step 1°) to 500 yr
console.log('Fine sweep near 315° (every 1°), tested to 500 yr:');
let bests = [];
for (let ph = 285; ph <= 345; ph++) {
  const yr = runToYear(ph, 500);
  const s = yr > 500 ? '500+ yr ✓' : `ejected yr ${yr}`;
  if (yr > 500) bests.push(ph);
  if (yr > 300) console.log(`  ph=${ph}°: ${s}`);
}
console.log(`\nPhases surviving 500 yr: [${bests.join(', ')}]`);

// Test survivors to 1000 yr
if (bests.length > 0) {
  console.log('\nTesting 500 yr survivors to 1000 yr:');
  for (const ph of bests) {
    const yr = runToYear(ph, 1000);
    console.log(`  ph=${ph}°: ${yr > 1000 ? 'stable to 1000 yr ✓✓' : `ejected yr ${yr}`}`);
  }
}
