// S02 · The test. Sixteen lights in a dark room; one after another tips from blue to amber.
import * as THREE from 'three';
import { glow, dust, lightShaft, makeLines, aim } from '../src/lib/gfx.js';
import { rng, smooth, sat, lerp, PAL, easeInOut } from '../src/lib/util.js';

export default function create() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);
  const r = rng(202);
  const FLOOR = -1.7;
  scene.add(dust({ count: 1200, box: [18, 7, 14], color: [0.4, 0.55, 0.85], size: 0.035, fog: 0.045, opacity: 0.5, seed: 5 }));

  const nodes = [];
  const order = [...Array(16).keys()].sort(() => r() - 0.5);
  const stay = new Set(order.slice(13)); // three stay blue: "die große Mehrheit", not all
  const deep = new Set(order.slice(0, 2)); // the two at 96 %
  const stems = [];
  for (let i = 0; i < 16; i++) {
    const row = i < 8 ? 0 : 1, k = i % 8;
    const x = (k - 3.5) * 1.75 + (row ? 0.85 : 0) + 2.4, z = row ? -3.2 : 0, y = row ? 0.75 : 0;
    const core = glow([1, 1, 1], 0.2, 1), halo = glow(PAL.blue, 1.2, 0.5), refl = glow(PAL.blue, 1, 0.3);
    core.position.set(x, y, z); halo.position.set(x, y, z);
    refl.position.set(x, FLOOR, z); refl.scale.set(1.7, 0.16, 1);
    const shaft = lightShaft({ color: PAL.blue, height: 7, radius: 0.34, top: 0.02, opacity: 0.1 });
    shaft.position.set(x, y + 7, z);
    scene.add(shaft, halo, core, refl);
    stems.push(x, y, z, x, FLOOR, z);
    nodes.push({ core, halo, refl, shaft, i, x, y, z, rank: order.indexOf(i), appear: 0.4 + (row * 8 + k) * 0.0, seed: r() });
  }
  const stem = makeLines({ pos: new Float32Array(stems) }, { fog: 0.02, opacity: 0.13 });
  stem.material.uniforms.uTint.value.setRGB(...PAL.blue);
  scene.add(stem);
  // floor line grid to anchor the room
  const grid = [];
  for (let gx = -14; gx <= 18; gx += 1.75) grid.push(gx, FLOOR, -9, gx, FLOOR, 5);
  for (let gz = -9; gz <= 5; gz += 1.75) grid.push(-14, FLOOR, gz, 18, FLOOR, gz);
  const floor = makeLines({ pos: new Float32Array(grid) }, { fog: 0.06, opacity: 0.1 });
  floor.material.uniforms.uTint.value.setRGB(0.25, 0.45, 0.8);
  scene.add(floor);

  const c = new THREE.Color();
  function update({ t, u, marks }) {
    const appearEnd = Math.max(2, marks.flip - 2.2);
    for (const n of nodes) {
      const ta = n.i === 3 ? 0 : 0.6 + (n.rank / 15) * (appearEnd - 0.6);
      const on = smooth(ta, ta + 0.7, t);
      // flip time: spread between "flip" and "two"; the two deep ones go last
      let f = 0, d = 0;
      if (!stay.has(n.i)) {
        const tf = deep.has(n.i) ? marks.two - 0.9 + n.rank * 0.35 : marks.flip + 0.2 + ((n.rank - 2) / 11) * (marks.two - marks.flip - 1.3);
        f = smooth(tf, tf + 0.55, t);
        if (deep.has(n.i)) d = smooth(marks.two + 0.2, marks.two + 1.2, t);
      }
      const col = [lerp(PAL.blue[0], lerp(PAL.amber[0], 1, d), f), lerp(PAL.blue[1], lerp(PAL.amber[1], 0.3, d), f), lerp(PAL.blue[2], lerp(PAL.amber[2], 0.12, d), f)];
      const pulse = 1 + 0.07 * Math.sin(t * 2.1 + n.seed * 9) + d * 0.35 * (0.5 + 0.5 * Math.sin(t * 5.5 + n.seed));
      c.setRGB(...col);
      n.halo.material.color.copy(c); n.refl.material.color.copy(c); n.shaft.material.uniforms.uColor.value.copy(c);
      n.halo.material.opacity = (0.34 + 0.2 * d) * on * pulse; n.core.material.opacity = on;
      n.halo.scale.setScalar(1.15 * (1 + 0.7 * d) * pulse);
      n.core.scale.setScalar(0.2 * (1 + 0.5 * d));
      n.refl.material.opacity = 0.2 * on * pulse;
      n.shaft.material.uniforms.uOpacity.value = (0.035 + 0.03 * f + 0.1 * d) * on;
    }
    const e = easeInOut(u);
    aim(camera, lerp(-9.5, -7.0, e), lerp(1.7, 1.2, e), lerp(11.5, 10.6, e), lerp(0.6, 1.2, e), 0.3, -1.2);
    return { bloom: { strength: 0.7, radius: 0.6, threshold: 0.18 } };
  }
  return { scene, camera, update };
}
