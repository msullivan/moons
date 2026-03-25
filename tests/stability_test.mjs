const G=6.674e-11, AU=1.496e11, LUNAR_DIST=3.844e8;
const M_SUN=1.989e30, M_EARTH=5.972e24, M_MOON=7.342e22, DT=360;

function makeBodies(moons) {
  const ve = Math.sqrt(G*M_SUN/AU);
  const bodies = [
    { name:'Sun',  m:M_SUN,   x:0,  y:0, vx:0, vy:0 },
    { name:'Qaia', m:M_EARTH, x:AU, y:0, vx:0, vy:ve },
  ];
  for (const moon of moons) {
    const a=moon.a*LUNAR_DIST, rp=a*(1-moon.e), vp=Math.sqrt(G*M_EARTH*(1+moon.e)/rp);
    const th=(moon.angle??0)*Math.PI/180, c=Math.cos(th), s=Math.sin(th);
    bodies.push({ name:moon.name, m:moon.mf*M_MOON,
      x:AU+rp*c, y:rp*s, vx:-vp*s, vy:ve+vp*c, ax:0, ay:0 });
  }
  let tm=0,cx=0,cy=0,cvx=0,cvy=0;
  for (const b of bodies) { tm+=b.m; cx+=b.m*b.x; cy+=b.m*b.y; cvx+=b.m*b.vx; cvy+=b.m*b.vy; }
  cx/=tm; cy/=tm; cvx/=tm; cvy/=tm;
  for (const b of bodies) { b.x-=cx; b.y-=cy; b.vx-=cvx; b.vy-=cvy; b.ax=0; b.ay=0; }
  computeAccel(bodies); return bodies;
}
function computeAccel(bodies) {
  for (const b of bodies) { b.ax=0; b.ay=0; }
  for (let i=0;i<bodies.length;i++) for (let j=i+1;j<bodies.length;j++) {
    const bi=bodies[i],bj=bodies[j],dx=bj.x-bi.x,dy=bj.y-bi.y,r2=dx*dx+dy*dy,r=Math.sqrt(r2),f=G/(r2*r);
    bi.ax+=f*bj.m*dx; bi.ay+=f*bj.m*dy; bj.ax-=f*bi.m*dx; bj.ay-=f*bi.m*dy;
  }
}
function step(bodies) {
  for (const b of bodies) { b.x+=b.vx*DT+0.5*b.ax*DT*DT; b.y+=b.vy*DT+0.5*b.ay*DT*DT; }
  const ax0=bodies.map(b=>b.ax), ay0=bodies.map(b=>b.ay);
  computeAccel(bodies);
  for (let i=0;i<bodies.length;i++) { bodies[i].vx+=0.5*(ax0[i]+bodies[i].ax)*DT; bodies[i].vy+=0.5*(ay0[i]+bodies[i].ay)*DT; }
}

function testConfig(label, moons, maxYears=1000) {
  const bodies=makeBodies(moons), qaia=bodies[1], moonBodies=bodies.slice(2);
  const escaped={}, spy=Math.round(365.25*86400/DT);
  for (let yr=100;yr<=maxYears;yr+=100) {
    for (let i=0;i<spy*100;i++) step(bodies);
    for (const b of moonBodies) {
      if (escaped[b.name]) continue;
      const dx=b.x-qaia.x,dy=b.y-qaia.y,r=Math.sqrt(dx*dx+dy*dy),dvx=b.vx-qaia.vx,dvy=b.vy-qaia.vy;
      if (0.5*(dvx*dvx+dvy*dvy)-G*M_EARTH/r>0) escaped[b.name]=yr;
    }
    const status = moonBodies.map(b => escaped[b.name] ? ('GONE@'+escaped[b.name]).padEnd(10) : 'ok        ').join(' ');
    process.stdout.write(label + ' yr' + String(yr).padStart(4) + ':  ' + status + '\n');
    if (Object.keys(escaped).length === moonBodies.length) break;
  }
  console.log();
}

// Period ratio of Inner2 to Secundus (a=0.45): T ratio = (i2/0.45)^(3/2)
// 0.28 LD → ratio 3.51 ≈ 7:2. Try values below and above, avoiding simple fractions.
// Also need: Inner1(a=0.12) apo=0.132 < Inner2 peri, and Inner2 apo < Secundus peri=0.405
// So Inner2 must satisfy: a > 0.132/(1-e) and a*(1+e) < 0.405
// With e=0.10: 0.147 < a < 0.368

const e = 0.10;
const secA = 0.45;
// Print period ratios to flag resonances
console.log('Inner2 a  period_ratio_to_Secundus  apo    gap_to_sec_peri');
for (const a2 of [0.18, 0.20, 0.22, 0.24, 0.26, 0.28, 0.30, 0.32, 0.34, 0.36]) {
  const ratio = Math.pow(a2/secA, 3/2);
  const apo = (a2*(1+e)).toFixed(3);
  const gap = (secA*(1-e) - a2*(1+e)).toFixed(3);
  console.log('  ' + a2 + '      ' + ratio.toFixed(3) + '                     ' + apo + '  ' + gap);
}
console.log();
console.log('Notable resonances: 4:1=0.250, 7:2=0.354=3.5, 3:1=0.333, 5:2=0.400=2.5');
console.log();

// Test a sweep of Inner2 positions
for (const a2 of [0.20, 0.22, 0.24, 0.26, 0.30, 0.32, 0.34]) {
  const ratio = Math.pow(a2/secA, 3/2);
  testConfig('I2@' + a2 + ' ratio=' + ratio.toFixed(2), [
    { name:'Inner1',   a:0.12, e:0.10, mf:0.02, angle:  0 },
    { name:'Inner2',   a:a2,   e:0.10, mf:0.04, angle: 90 },
    { name:'Secundus', a:0.45, e:0.10, mf:0.25, angle:180 },
    { name:'Primus',   a:1.00, e:0.00, mf:1.00, angle:270 },
  ]);
}
