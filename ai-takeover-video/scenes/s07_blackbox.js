// S07 · Chapter 2, the black box. The net grows so dense nobody can see through it. A cone
// of human-blue light samples one tiny patch.
import * as THREE from 'three';
import { makePoints, makeLines, lightShaft, glow, dust, aim, project } from '../src/lib/gfx.js';
import { rng, smooth, sat, lerp, PAL, easeInOut, heatColor } from '../src/lib/util.js';

export default function create({ def }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 300);
  const r = rng(707);
  const col = heatColor(def.heat), hot = heatColor(0.9);
  const N = 15000;
  const P = new Float32Array(N * 3), C = new Float32Array(N * 3), S = new Float32Array(N), B = new Float32Array(N);
  const ep = [], eb = [];
  const SAMPLE = new THREE.Vector3(-1.2, 2.0, 3.6), SR = 1.1;
  const inSample = [];
  // organic growth: each node buds off an earlier one, so edges stay short and local
  for (let i = 0; i < N; i++) {
    let x, y, z;
    if (i < 12) { x = r.range(-1, 1); y = r.range(-1, 1); z = r.range(-1, 1); }
    else {
      for (let tries = 0; tries < 6; tries++) {
        const j = Math.floor(Math.pow(r(), 0.6) * i);
        const a = r() * Math.PI * 2, b = Math.acos(r() * 2 - 1), d = r.range(0.25, 0.75);
        x = P[j * 3] + d * Math.sin(b) * Math.cos(a); y = P[j * 3 + 1] + d * Math.cos(b); z = P[j * 3 + 2] + d * Math.sin(b) * Math.sin(a);
        if ((x * x) / 49 + (y * y) / 17 + (z * z) / 25 < 1) {
          if (i % 2 === 0) { ep.push(x, y, z, P[j * 3], P[j * 3 + 1], P[j * 3 + 2]); eb.push(i / N, i / N); }
          break;
        }
      }
    }
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    S[i] = r() > 0.988 ? 0.14 : r.range(0.03, 0.06); B[i] = i / N;
    const dx = x - SAMPLE.x, dy = y - SAMPLE.y, dz = z - SAMPLE.z;
    inSample.push(dx * dx + dy * dy + dz * dz < SR * SR ? 1 : 0);
  }
  const nodes = makePoints({ pos: P, col: C, size: S, birth: B }, { fog: 0.012, twinkle: 0.5, revealSoft: 0.04 });
  // the sampled nodes again, larger, so the patch really reads as lit
  const si = inSample.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const sp = new Float32Array(si.length * 3), sb = new Float32Array(si.length);
  si.forEach((i, k) => { sp[k * 3] = P[i * 3]; sp[k * 3 + 1] = P[i * 3 + 1]; sp[k * 3 + 2] = P[i * 3 + 2]; sb[k] = B[i]; });
  const lit = makePoints({ pos: sp, birth: sb, size: new Float32Array(si.length).fill(0.1) }, { fog: 0.012, twinkle: 0.6, revealSoft: 0.04 });
  const edges = makeLines({ pos: new Float32Array(ep), birth: new Float32Array(eb) }, { fog: 0.012, opacity: 0.07, revealSoft: 0.04 });
  const net = new THREE.Group();
  net.add(edges, nodes, lit);
  scene.add(net);
  const coreGlow = glow(col, 16, 0.3);
  scene.add(coreGlow);

  const cone = lightShaft({ color: PAL.blue, height: 13, radius: 1.5, top: 0.03, opacity: 0.4 });
  const SRC = new THREE.Vector3(-8.5, 11.5, 8.5);
  scene.add(cone);
  const ring = [];
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2, b = ((i + 1) / 64) * Math.PI * 2; ring.push(Math.cos(a) * SR, Math.sin(a) * SR, 0, Math.cos(b) * SR, Math.sin(b) * SR, 0); }
  const loop = makeLines({ pos: new Float32Array(ring) }, { fog: 0, opacity: 0.9 });
  scene.add(loop);
  scene.add(dust({ count: 1100, box: [16, 9, 12], color: col, size: 0.035, fog: 0.035, opacity: 0.4, seed: 15 }));
  const tmp = new THREE.Vector3(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, -1, 0);

  function update({ t, u, marks }) {
    const grow = 0.08 + 0.92 * easeInOut(sat(t / (marks.tests + 2)));
    nodes.material.uniforms.uReveal.value = grow; edges.material.uniforms.uReveal.value = grow;
    net.rotation.y = 0.12 * t * 0.35;
    net.updateMatrixWorld();
    const sampleOn = smooth(marks.sample - 0.4, marks.sample + 0.8, t);
    const knows = smooth(marks.knows - 0.1, marks.knows + 0.9, t);
    // colours: amber mass, sampled patch in human blue; at "Es weiß..." the patch tips over
    const base = [lerp(col[0], hot[0], knows * 0.7), lerp(col[1], hot[1], knows * 0.7), lerp(col[2], hot[2], knows * 0.7)];
    const sc = [lerp(PAL.ice[0], hot[0], knows), lerp(PAL.ice[1], hot[1], knows), lerp(PAL.ice[2], hot[2], knows)];
    const ca = nodes.geometry.attributes.color;
    for (let i = 0; i < N; i++) {
      const s = inSample[i] * sampleOn, k = 0.16 + 0.4 * ((i * 7919) % 100) / 100;
      ca.setXYZ(i, lerp(base[0] * k, sc[0] * 2.2, s), lerp(base[1] * k, sc[1] * 2.2, s), lerp(base[2] * k, sc[2] * 2.2, s));
    }
    ca.needsUpdate = true;
    edges.material.uniforms.uTint.value.setRGB(...base);
    lit.material.uniforms.uReveal.value = grow;
    lit.material.uniforms.uTint.value.setRGB(...sc);
    lit.material.uniforms.uOpacity.value = 0.85 * sampleOn;
    coreGlow.material.color.setRGB(...base);
    coreGlow.material.opacity = 0.03 + 0.07 * grow + 0.06 * knows;

    const e = easeInOut(u);
    aim(camera, lerp(-3.0, 1.5, e), lerp(1.6, 0.8, e), lerp(18.5, 15, e), lerp(-2.9, -2.2, e), 0.2, 0);
    // cone from the source to the sample patch (patch rotates with the net)
    tmp.copy(SAMPLE).applyMatrix4(net.matrixWorld);
    cone.position.copy(SRC);
    q.setFromUnitVectors(up, tmp.clone().sub(SRC).normalize());
    cone.quaternion.copy(q);
    cone.scale.set(1, tmp.distanceTo(SRC) / 13 * 1.12, 1);
    cone.material.uniforms.uOpacity.value = 0.34 * sampleOn * (1 - 0.55 * knows);
    cone.material.uniforms.uColor.value.setRGB(...PAL.blue);
    loop.position.copy(tmp); loop.quaternion.copy(camera.quaternion);
    loop.material.uniforms.uOpacity.value = 0.85 * sampleOn;
    loop.material.uniforms.uTint.value.setRGB(...sc);
    const lp = project(tmp.x, tmp.y + SR + 0.45, tmp.z, camera);
    const lp2 = project(tmp.x, tmp.y - SR - 0.45, tmp.z, camera);
    const passed = smooth(marks.tests + 0.6, marks.tests + 1.2, t);
    const labels = [
      { text: 'STICHPROBE', x: lp.x, y: lp.y, size: 19, weight: 700, spacing: 5, color: sc, alpha: sampleOn * 0.95, glow: 8 },
      { text: 'TEST BESTANDEN', x: lp2.x, y: lp2.y, size: 19, weight: 700, spacing: 5, color: PAL.ice, alpha: passed * 0.95, glow: 8 },
    ];
    return { labels, bloom: { strength: 0.65, radius: 0.7, threshold: 0.3 } };
  }
  return { scene, camera, update };
}
