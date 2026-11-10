// S10 · Point of no return. A clock face made of particles in deep red; the camera plunges
// towards it. In the silence everything freezes. Then the clock dissolves.
import * as THREE from 'three';
import { makePoints, glow, dust, aim } from '../src/lib/gfx.js';
import { rng, smooth, sat, lerp, PAL, easeInOut, easeIn, heatColor } from '../src/lib/util.js';

export default function create({ def }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
  const r = rng(1010);
  const R = 4.2;
  const pts = []; // { kind, a (angle), rad, z, size, bright, vel }
  const add = (kind, a, rad, size, bright, extra = {}) => pts.push({ kind, a, rad, z: r.range(-0.06, 0.06), size, bright, v: [r.gauss(), r.gauss(), r.gauss() * 0.8], d: r(), ...extra });
  for (let i = 0; i < 1400; i++) add('ring', r() * Math.PI * 2, R * (1.06 + r.gauss() * 0.012), r.range(0.03, 0.07), r.range(0.4, 1));
  for (let i = 0; i < 900; i++) add('ring', r() * Math.PI * 2, R * (1.2 + Math.abs(r.gauss()) * 0.25), r.range(0.02, 0.05), r.range(0.1, 0.5));
  for (let k = 0; k < 60; k++) {
    const major = k % 5 === 0, n = major ? 26 : 9;
    for (let i = 0; i < n; i++) add('tick', (k / 60) * Math.PI * 2, R * (major ? lerp(0.8, 1.0, i / n) : lerp(0.93, 1.0, i / n)), major ? 0.07 : 0.045, major ? 1 : 0.6);
  }
  for (let i = 0; i < 260; i++) add('min', 0, lerp(-0.4, R * 0.9, i / 260), 0.06, 1, { w: r.gauss() * 0.02 });
  for (let i = 0; i < 170; i++) add('hour', 0, lerp(-0.3, R * 0.55, i / 170), 0.075, 1, { w: r.gauss() * 0.03 });
  for (let i = 0; i < 120; i++) add('hub', r() * Math.PI * 2, r() * 0.16, 0.07, 1);
  const N = pts.length;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = Float32Array.from(pts, (p) => p.size);
  const cloud = makePoints({ pos, col, size }, { fog: 0.01, twinkle: 0.35 });
  scene.add(cloud);
  const heart = glow(heatColor(1), 9, 0.3);
  scene.add(heart);
  // tunnel of streaks rushing past
  const M = 1600, sp = new Float32Array(M * 3), sc = new Float32Array(M * 3), ss = new Float32Array(M), sb = [];
  for (let i = 0; i < M; i++) { const a = r() * Math.PI * 2, rad = r.range(5.5, 16); sb.push({ a, rad, z: r.range(0, 80), sp: r.range(0.6, 1.4) }); const k = r.range(0.15, 0.6); sc[i * 3] = k; sc[i * 3 + 1] = k * 0.16; sc[i * 3 + 2] = k * 0.1; ss[i] = r.range(0.04, 0.1); }
  const streaks = makePoints({ pos: sp, col: sc, size: ss }, { fog: 0.02, twinkle: 0.2 });
  scene.add(streaks);
  const hot = heatColor(1), amber = heatColor(0.7);

  function update({ t, u, marks, def, dur }) {
    const T1 = marks.silence;
    const tt = Math.min(t, T1); // everything freezes in the silence
    const p = sat(tt / T1); // clock runs 00:00 -> 23:59
    const minA = -p * 24 * Math.PI * 2, hourA = -p * 2 * Math.PI * 2;
    const dis = Math.max(0, t - marks.dissolve);
    const dk = dis * dis * 0.1 + dis * 0.35;
    const pa = cloud.geometry.attributes.position, ca = cloud.geometry.attributes.color;
    const pulse = 0.85 + 0.15 * Math.sin(tt * 9);
    for (let i = 0; i < N; i++) {
      const q = pts[i];
      let a = q.a, rad = q.rad, off = 0;
      if (q.kind === 'min') { a = Math.PI / 2 + minA; off = q.w; }
      else if (q.kind === 'hour') { a = Math.PI / 2 + hourA; off = q.w; }
      let x = Math.cos(a) * rad - Math.sin(a) * off * 8, y = Math.sin(a) * rad + Math.cos(a) * off * 8, z = q.z;
      // dissolve: hands first, then ticks, then the ring
      const delay = q.kind === 'min' || q.kind === 'hour' || q.kind === 'hub' ? 0 : q.kind === 'tick' ? 0.5 : 1.0;
      const k = Math.max(0, dk - delay * (0.5 + q.d));
      x += q.v[0] * k * 1.6 + Math.sin(q.d * 40 + t) * k * 0.3; y += q.v[1] * k * 1.6 + 0.5 * k; z += q.v[2] * k * 2.4;
      pa.setXYZ(i, x, y, z);
      const fade = Math.exp(-k * 0.22);
      const c = q.kind === 'ring' ? hot : q.kind === 'tick' ? amber : [1, 0.75, 0.6];
      const b = q.bright * fade * (q.kind === 'min' || q.kind === 'hour' ? pulse * 1.3 : 1);
      ca.setXYZ(i, c[0] * b, c[1] * b, c[2] * b);
    }
    pa.needsUpdate = true; ca.needsUpdate = true;

    // plunge: accelerates, freezes in the silence, drifts through the debris afterwards
    const plunge = Math.pow(p, 2.2);
    const cz = lerp(24, 7.2, plunge) - Math.max(0, t - marks.dissolve) * 0.35;
    const spa = streaks.geometry.attributes.position;
    const flow = 6 * tt + 60 * plunge;
    for (let i = 0; i < M; i++) { const s = sb[i]; const z = cz - 70 + ((s.z + flow * s.sp) % 80); spa.setXYZ(i, Math.cos(s.a) * s.rad, Math.sin(s.a) * s.rad, z); }
    spa.needsUpdate = true;
    heart.material.opacity = (0.2 + 0.25 * plunge) * Math.exp(-dk * 0.3);
    heart.scale.setScalar(9 + 5 * plunge);
    const shake = 0.05 * plunge * (t < T1 ? 1 : 0);
    aim(camera, Math.sin(tt * 31) * shake + 0.6 * (1 - plunge), Math.cos(tt * 27) * shake + 0.25 * (1 - plunge), cz, 0, 0, 0);
    camera.rotation.z = 0.25 * (1 - plunge) + (t > marks.dissolve ? 0.02 * (t - marks.dissolve) : 0);
    const inSilence = t >= T1 && t < marks.dissolve;
    return { bloom: { strength: 1.05, radius: 0.72, threshold: 0.1 }, grain: inSilence ? 0.03 : 0.085, ca: inSilence ? 0.3 : 1 + plunge, exposure: inSilence ? 0.8 : 1 };
  }
  return { scene, camera, update };
}
